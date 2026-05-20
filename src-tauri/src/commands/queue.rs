use crate::sonos::client::{FetchRequest, FetchResponse, SonosClient};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone)]
struct ReorderBatch {
    items: Vec<usize>,
    positions: Vec<usize>,
}

/// Port of `computeReorderBatches` from src/main.ts:1664.
/// Groups indices into contiguous runs, computes target positions via pivot lookup,
/// and emits one PATCH per run, applying each to a working order so later runs see
/// the updated state.
fn compute_reorder_batches(
    from_indices: &[usize],
    insert_before: usize,
    queue_length: usize,
) -> Vec<ReorderBatch> {
    let mut sorted = from_indices.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    if sorted.is_empty() {
        return Vec::new();
    }

    // Group sorted into contiguous runs
    let mut runs: Vec<Vec<usize>> = Vec::new();
    let mut curr: Vec<usize> = vec![sorted[0]];
    for &v in &sorted[1..] {
        if v == *curr.last().unwrap() + 1 {
            curr.push(v);
        } else {
            runs.push(std::mem::take(&mut curr));
            curr.push(v);
        }
    }
    runs.push(curr);

    let selected: std::collections::HashSet<usize> = sorted.iter().copied().collect();
    let non_selected: Vec<usize> = (0..queue_length).filter(|i| !selected.contains(i)).collect();

    // Anchor = first non-selected item at-or-after insert_before
    let mut anchor_idx = non_selected.len();
    for i in insert_before..queue_length {
        if !selected.contains(&i) {
            if let Some(pos) = non_selected.iter().position(|&x| x == i) {
                anchor_idx = pos;
            }
            break;
        }
    }

    let mut target: Vec<usize> = Vec::with_capacity(queue_length);
    target.extend_from_slice(&non_selected[..anchor_idx]);
    target.extend_from_slice(&sorted);
    target.extend_from_slice(&non_selected[anchor_idx..]);

    // Early-exit if already in order
    if target.iter().enumerate().all(|(i, &v)| v == i) {
        return Vec::new();
    }

    let mut working: Vec<usize> = (0..queue_length).collect();
    let mut batches: Vec<ReorderBatch> = Vec::new();

    for run in &runs {
        let run_len = run.len();
        let current_start = working.iter().position(|&v| v == run[0]).unwrap();

        let target_run_start = target.iter().position(|&v| v == run[0]).unwrap();
        let final_pos = if target_run_start == 0 {
            0
        } else {
            let pivot = target[target_run_start - 1];
            working.iter().position(|&v| v == pivot).unwrap() + 1
        };

        if current_start == final_pos {
            continue;
        }

        batches.push(ReorderBatch {
            items: (current_start..current_start + run_len).collect(),
            positions: (final_pos..final_pos + run_len).collect(),
        });

        // Apply the move to working: remove [current_start..current_start+run_len], reinsert at final_pos
        let run_contents: Vec<usize> = working
            .drain(current_start..current_start + run_len)
            .collect();
        let insert_at = if final_pos <= current_start {
            final_pos
        } else {
            final_pos - run_len
        };
        for (i, v) in run_contents.into_iter().enumerate() {
            working.insert(insert_at + i, v);
        }
    }

    batches
}

#[tauri::command]
pub async fn queue_reorder(
    client: State<'_, Arc<SonosClient>>,
    from_indices: Vec<i64>,
    to_index: i64,
    queue_length: i64,
) -> Result<Value, String> {
    if from_indices.iter().any(|&i| i < 0) {
        return Ok(json!({ "error": "Invalid fromIndices" }));
    }
    if to_index < 0 {
        return Ok(json!({ "error": "Invalid toIndex" }));
    }
    if queue_length <= 0 {
        return Ok(json!({ "error": "Invalid queueLength" }));
    }
    if from_indices.is_empty() {
        return Ok(json!({ "ok": true }));
    }

    let from: Vec<usize> = from_indices.iter().map(|&i| i as usize).collect();
    let batches = compute_reorder_batches(&from, to_index as usize, queue_length as usize);

    for batch in batches {
        let items = batch
            .items
            .iter()
            .map(|i| i.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let positions = batch
            .positions
            .iter()
            .map(|i| i.to_string())
            .collect::<Vec<_>>()
            .join(",");

        let mut query = HashMap::new();
        query.insert("items".to_string(), Some(items));
        query.insert("positions".to_string(), Some(positions));

        let res = client
            .fetch(FetchRequest {
                operation_id: "reorderQueueResources".into(),
                path_params: HashMap::new(),
                query,
                body: None,
                headers: HashMap::new(),
            })
            .await;
        if let Some(err) = res.error {
            return Ok(json!({ "error": err }));
        }
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn queue_remove(
    client: State<'_, Arc<SonosClient>>,
    indices: Vec<i64>,
) -> Result<FetchResponse, String> {
    if indices.iter().any(|&i| i < 0) {
        return Ok(FetchResponse {
            error: Some("Invalid indices".into()),
            ..Default::default()
        });
    }
    let items = indices
        .iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let mut query = HashMap::new();
    query.insert("items".to_string(), Some(items));
    Ok(client
        .fetch(FetchRequest {
            operation_id: "deleteQueueResources".into(),
            path_params: HashMap::new(),
            query,
            body: None,
            headers: HashMap::new(),
        })
        .await)
}

#[tauri::command]
pub async fn queue_clear(
    client: State<'_, Arc<SonosClient>>,
) -> Result<FetchResponse, String> {
    Ok(client
        .fetch(FetchRequest {
            operation_id: "deleteQueueResources".into(),
            path_params: HashMap::new(),
            query: HashMap::new(),
            body: None,
            headers: HashMap::new(),
        })
        .await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_op_when_in_place() {
        let batches = compute_reorder_batches(&[0, 1], 0, 5);
        assert!(batches.is_empty());
    }

    #[test]
    fn single_run_move_forward() {
        // [0,1,2,3] move {0} before 3 → target [1,2,0,3]; pivot 2 is at working pos 2, so finalPos = 3.
        let batches = compute_reorder_batches(&[0], 3, 4);
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].items, vec![0]);
        assert_eq!(batches[0].positions, vec![3]);
    }

    #[test]
    fn non_contiguous_split_into_runs() {
        let batches = compute_reorder_batches(&[0, 2], 4, 5);
        assert_eq!(batches.len(), 2);
    }
}
