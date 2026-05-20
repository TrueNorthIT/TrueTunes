use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
    Delete,
    Patch,
}

impl HttpMethod {
    pub fn is_idempotent(self) -> bool {
        matches!(self, HttpMethod::Get)
    }

    pub fn as_reqwest(self) -> reqwest::Method {
        match self {
            HttpMethod::Get => reqwest::Method::GET,
            HttpMethod::Post => reqwest::Method::POST,
            HttpMethod::Delete => reqwest::Method::DELETE,
            HttpMethod::Patch => reqwest::Method::PATCH,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Operation {
    pub method: HttpMethod,
    pub path: &'static str,
}

macro_rules! op {
    ($method:ident, $path:expr) => {
        Operation {
            method: HttpMethod::$method,
            path: $path,
        }
    };
}

pub fn registry() -> HashMap<&'static str, Operation> {
    let mut m = HashMap::new();
    // Auth
    m.insert("getAuthDiscovery", op!(Get, "/api/authz/discovery"));
    // Groups
    m.insert("getGroups", op!(Get, "/api/groups/v1/households/:householdId/groups"));
    // Queue
    m.insert("getQueueResources", op!(Get, "/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources"));
    m.insert("addQueueResource", op!(Post, "/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources"));
    m.insert("deleteQueueResources", op!(Delete, "/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources"));
    m.insert("reorderQueueResources", op!(Patch, "/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources"));
    // Browse
    m.insert("browseAlbum", op!(Get, "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/albums/:albumId/browse"));
    m.insert("browseArtist", op!(Get, "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/artists/:artistId/browse"));
    m.insert("browseContainer", op!(Get, "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/containers/:containerId/browse"));
    m.insert("browsePlaylist", op!(Get, "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/playlists/:playlistId/browse"));
    m.insert("getCatalogContainerResources", op!(Get, "/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/catalog/containers/:containerId/resources"));
    // Favorites & History
    m.insert("getFavoriteResources", op!(Get, "/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId/favorites/resources"));
    m.insert("getHistory", op!(Get, "/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId/history"));
    // Search
    m.insert("searchHousehold", op!(Get, "/api/content/v1/households/:householdId/search"));
    m.insert("searchService", op!(Get, "/api/content/v1/households/:householdId/services/:searchServiceId/accounts/:searchAccountId/search"));
    // Integrations
    m.insert("getIntegrations", op!(Get, "/api/content/v1/households/:householdId/integrations"));
    m.insert("getIntegrationRegistrations", op!(Get, "/api/content/v1/households/:householdId/integrations/registrations"));
    // Now Playing
    m.insert("getTrackNowPlaying", op!(Get, "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/tracks/:trackId/nowplaying"));
    // Playback
    m.insert("getPlaybackState", op!(Get, "/api/playback/v1/groups/:groupId"));
    m.insert("play", op!(Post, "/api/playback/v1/groups/:groupId/play"));
    m.insert("pause", op!(Post, "/api/playback/v1/groups/:groupId/pause"));
    m.insert("skipToNextTrack", op!(Post, "/api/playback/v1/groups/:groupId/skipToNextTrack"));
    m.insert("skipToPreviousTrack", op!(Post, "/api/playback/v1/groups/:groupId/skipToPreviousTrack"));
    m.insert("setPlayMode", op!(Post, "/api/playback/v1/groups/:groupId/playMode"));
    // Platform
    m.insert("getMfe", op!(Get, "/api/mfe"));
    m.insert("getOptimizelyConfig", op!(Get, "/api/optimizely/:key"));
    m.insert("postMetrics", op!(Post, "/api/metrics"));
    m
}

pub const SEARCH_SERVICE_ID: &str = "72711";
pub const SEARCH_ACCOUNT_ID: &str = "13";
pub const PLATFORM_SERVICE_ID: &str = "16751367";
pub const PLATFORM_ACCOUNT_ID: &str = "123209393";
pub const BASE_URL: &str = "https://play.sonos.com";
pub const SPOOF_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
