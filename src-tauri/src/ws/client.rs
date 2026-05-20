use super::creds;
use super::ticket;
use crate::sonos::operations::{BASE_URL, SPOOF_UA};
use crate::sonos::SonosState;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

const WS_URL: &str = "wss://api.ws.sonos.com/websocket";
const SUBPROTOCOL: &str = "v1.api.smartspeaker.audio";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupInfo {
    pub id: String,
    pub coordinator_id: String,
    pub name: String,
    pub player_ids: Vec<String>,
}

struct SendCmd {
    header: Value,
    payload: Value,
    respond: oneshot::Sender<Value>,
}

#[derive(Clone)]
pub struct WsHandle {
    tx: mpsc::Sender<SendCmd>,
}

impl WsHandle {
    pub async fn send(&self, header: Value, payload: Value) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(SendCmd {
                header,
                payload,
                respond: tx,
            })
            .await
            .map_err(|_| "WS send queue closed".to_string())?;
        tokio::time::timeout(Duration::from_secs(10), rx)
            .await
            .map_err(|_| "WS timeout".to_string())?
            .map_err(|_| "WS responder dropped".to_string())
    }
}

pub struct WsClient {
    handle: RwLock<Option<WsHandle>>,
    state: Arc<SonosState>,
    pub groups: RwLock<Vec<GroupInfo>>,
    /// One-shot push listeners keyed by `"namespace:name"` — fired on the first matching
    /// unsolicited push frame and then removed. Used to await `devices:devicesStatus`,
    /// which Sonos delivers separately from the `subscribe` ACK.
    push_once: Mutex<HashMap<String, oneshot::Sender<Value>>>,
}

impl WsClient {
    pub fn new(state: Arc<SonosState>) -> Self {
        Self {
            handle: RwLock::new(None),
            state,
            groups: RwLock::new(Vec::new()),
            push_once: Mutex::new(HashMap::new()),
        }
    }

    pub async fn handle(&self) -> Option<WsHandle> {
        self.handle.read().await.clone()
    }

    /// Supervised connect loop with exponential backoff.
    pub fn spawn(self: Arc<Self>, app: AppHandle) {
        tauri::async_runtime::spawn(async move {
            let mut delay = Duration::from_secs(1);
            loop {
                let token = match self.state.token().await {
                    Some(t) => t,
                    None => {
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                };

                match self.clone().connect_once(&app, &token).await {
                    Ok(()) => {
                        delay = Duration::from_secs(1);
                    }
                    Err(e) => {
                        eprintln!("[ws] connect failed: {e}");
                        let _ = app.emit("ws:error", e);
                    }
                }

                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(Duration::from_secs(30));
            }
        });
    }

    async fn connect_once(self: Arc<Self>, app: &AppHandle, token: &str) -> Result<(), String> {
        let ticket = ticket::fetch_ticket(token).await?;

        let url = format!("{WS_URL}?ticket={ticket}");
        let mut request = url.into_client_request().map_err(|e| e.to_string())?;
        let headers = request.headers_mut();
        headers.insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_static(SUBPROTOCOL),
        );
        headers.insert("Origin", HeaderValue::from_static(BASE_URL));
        headers.insert("User-Agent", HeaderValue::from_static(SPOOF_UA));
        headers.insert(
            "Cookie",
            HeaderValue::from_str(&format!("__Secure-next-auth.session-token={token}"))
                .map_err(|e| e.to_string())?,
        );

        let (ws_stream, _resp) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| format!("WS connect: {e}"))?;
        let (mut sink, mut stream) = ws_stream.split();

        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (cmd_tx, mut cmd_rx) = mpsc::channel::<SendCmd>(64);

        *self.handle.write().await = Some(WsHandle { tx: cmd_tx });

        let writer_pending = pending.clone();
        let writer = tokio::spawn(async move {
            while let Some(cmd) = cmd_rx.recv().await {
                let corr_id = uuid::Uuid::new_v4().to_string();
                let mut header = cmd.header;
                if let Value::Object(ref mut m) = header {
                    m.insert("corrId".into(), Value::String(corr_id.clone()));
                }
                writer_pending.lock().await.insert(corr_id, cmd.respond);
                let frame = json!([header, cmd.payload]);
                if sink
                    .send(Message::Text(frame.to_string().into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        // Kick off bootstrap once the connection is up. It enqueues commands via WsHandle
        // and awaits responses driven by the read loop below.
        let bootstrap_self = self.clone();
        let bootstrap_app = app.clone();
        let bootstrap = tokio::spawn(async move {
            if let Err(e) = bootstrap_self.run_bootstrap(&bootstrap_app).await {
                eprintln!("[ws] bootstrap: {e}");
            }
        });

        let read_result = read_loop(app, &mut stream, &pending, &self.push_once).await;
        bootstrap.abort();
        writer.abort();
        *self.handle.write().await = None;
        read_result
    }

    pub async fn run_bootstrap(self: Arc<Self>, app: &AppHandle) -> Result<(), String> {
        let handle = self
            .handle()
            .await
            .ok_or_else(|| "WS handle missing".to_string())?;

        // 1) getHouseholds
        let resp = handle
            .send(
                json!({ "command": "getHouseholds", "namespace": "households" }),
                json!({ "connectedOnly": "true" }),
            )
            .await?;

        let household_id = resp
            .get("households")
            .and_then(|h| h.as_array())
            .and_then(|a| a.first())
            .and_then(|h| h.get("id"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| "No household in getHouseholds response".to_string())?;

        {
            let mut ids = self.state.ids.write().await;
            ids.household_id = Some(household_id.clone());
        }

        // 1b) Discover serviceId/accountId from /integrations/registrations. Required for
        //     every browse / search / nowplaying URL — these endpoints embed :serviceId
        //     and :accountId rather than the hardcoded platform IDs the queue uses.
        if let Some(token) = self.state.token().await {
            match creds::discover_primary(&token, &household_id).await {
                Ok((sid, aid)) => {
                    let mut ids = self.state.ids.write().await;
                    ids.service_id = Some(sid);
                    ids.account_id = Some(aid);
                }
                Err(e) => eprintln!("[ws] service-creds discovery failed: {e}"),
            }
        }

        // 2) Subscribe to devices — but the topology arrives as a SEPARATE push frame
        //    (`devices:devicesStatus`), not in the subscribe ACK. Install a one-shot
        //    waiter, then send subscribe, then await the push with a 10s timeout.
        let (push_tx, push_rx) = oneshot::channel::<Value>();
        self.push_once
            .lock()
            .await
            .insert("devices:devicesStatus".into(), push_tx);

        let _ack = handle
            .send(
                json!({
                    "namespace": "devices",
                    "householdId": household_id,
                    "command": "subscribe"
                }),
                json!({}),
            )
            .await?;

        let devices_payload = match tokio::time::timeout(Duration::from_secs(10), push_rx).await {
            Ok(Ok(p)) => p,
            Ok(Err(_)) => return Err("devices push channel dropped".into()),
            Err(_) => {
                self.push_once
                    .lock()
                    .await
                    .remove("devices:devicesStatus");
                return Err("devices push timeout — no Sonos devices reachable?".into());
            }
        };

        let groups = extract_groups(&devices_payload);
        if let Some(g) = groups.first() {
            let mut ids = self.state.ids.write().await;
            ids.group_id = Some(g.id.clone());
            ids.queue_id = Some(g.coordinator_id.clone());
        }
        *self.groups.write().await = groups.clone();

        let _ = app.emit("ws:groups", &groups);
        let _ = app.emit("ws:ready", ());

        // 3) Subscribe to playbackExtended + groupVolume for the active group so the
        //    renderer receives playback/volume push updates.
        if let Some(g) = groups.first() {
            let gid = g.id.clone();
            let _ = handle
                .send(
                    json!({ "namespace": "playbackExtended", "groupId": gid, "command": "subscribe" }),
                    json!({}),
                )
                .await;
            let _ = handle
                .send(
                    json!({ "namespace": "groupVolume", "groupId": gid, "command": "subscribe" }),
                    json!({}),
                )
                .await;
        }

        Ok(())
    }
}

async fn read_loop<S>(
    app: &AppHandle,
    stream: &mut S,
    pending: &Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
    push_once: &Mutex<HashMap<String, oneshot::Sender<Value>>>,
) -> Result<(), String>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    while let Some(msg) = stream.next().await {
        let msg = msg.map_err(|e| format!("WS read: {e}"))?;
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => continue,
            Message::Close(_) => return Ok(()),
        };

        let parsed: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let arr = match parsed.as_array() {
            Some(a) if a.len() >= 2 => a,
            _ => continue,
        };
        let header = arr[0].clone();
        let payload = arr[1].clone();

        if let Some(corr) = header.get("corrId").and_then(|v| v.as_str()) {
            if let Some(responder) = pending.lock().await.remove(corr) {
                let _ = responder.send(payload.clone());
            }
        }

        // Fire one-shot push listeners keyed by "namespace:name" (or "namespace:type").
        let ns = header.get("namespace").and_then(|v| v.as_str());
        let name = header
            .get("name")
            .and_then(|v| v.as_str())
            .or_else(|| header.get("type").and_then(|v| v.as_str()));
        if let (Some(ns), Some(name)) = (ns, name) {
            let key = format!("{ns}:{name}");
            if let Some(tx) = push_once.lock().await.remove(&key) {
                let _ = tx.send(payload.clone());
            }
        }

        let _ = app.emit("ws:message", [header, payload]);
    }

    Ok(())
}

fn extract_groups(payload: &Value) -> Vec<GroupInfo> {
    let devices = payload
        .get("devices")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    use std::collections::BTreeMap;
    let mut group_map: BTreeMap<String, (Option<Value>, Vec<Value>)> = BTreeMap::new();
    for d in &devices {
        let gid = match d.get("groupId").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let entry = group_map.entry(gid).or_insert((None, Vec::new()));
        entry.1.push(d.clone());
        if d.get("isCoordinator")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            entry.0 = Some(d.clone());
        }
    }

    let mut groups = Vec::new();
    for (group_id, (coord, members)) in group_map {
        let Some(coord) = coord else { continue };
        let Some(cid) = coord
            .get("info")
            .and_then(|i| i.get("id"))
            .and_then(|v| v.as_str())
        else {
            continue;
        };
        let name = coord
            .get("info")
            .and_then(|i| i.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or(cid)
            .to_string();
        let player_ids: Vec<String> = members
            .iter()
            .filter_map(|m| {
                m.get("info")
                    .and_then(|i| i.get("id"))
                    .and_then(|v| v.as_str())
            })
            .map(String::from)
            .collect();
        groups.push(GroupInfo {
            id: group_id,
            coordinator_id: cid.to_string(),
            name,
            player_ids,
        });
    }
    groups
}
