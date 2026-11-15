//! Application-level metrics exported via OpenTelemetry and exposed
//! in-process for `/system-analytics`.

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

static COMMITS_APPLIED: AtomicU64 = AtomicU64::new(0);
static RESOURCES_FETCHED_HTTP: AtomicU64 = AtomicU64::new(0);
static SEARCH_QUERIES: AtomicU64 = AtomicU64::new(0);
static DRIVES_CREATED: AtomicU64 = AtomicU64::new(0);
static WS_CONNECTIONS_ACTIVE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsSnapshot {
    pub commits_applied: u64,
    pub resources_fetched_http: u64,
    pub search_queries: u64,
    pub drives_created: u64,
    pub ws_connections_active: u64,
}

pub fn snapshot() -> MetricsSnapshot {
    MetricsSnapshot {
        commits_applied: COMMITS_APPLIED.load(Ordering::Relaxed),
        resources_fetched_http: RESOURCES_FETCHED_HTTP.load(Ordering::Relaxed),
        search_queries: SEARCH_QUERIES.load(Ordering::Relaxed),
        drives_created: DRIVES_CREATED.load(Ordering::Relaxed),
        ws_connections_active: WS_CONNECTIONS_ACTIVE.load(Ordering::Relaxed),
    }
}

pub fn ws_connected() {
    WS_CONNECTIONS_ACTIVE.fetch_add(1, Ordering::Relaxed);
}

pub fn ws_disconnected() {
    let _ = WS_CONNECTIONS_ACTIVE.try_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
        Some(v.saturating_sub(1))
    });
}

/// Increment a named OTel counter and its in-process atomic counter by 1.
/// The OTel instrument is created once via OnceLock and reused on every call.
macro_rules! counter {
    ($fn_name:ident, $atomic:ident, $metric:literal, $desc:literal) => {
        pub fn $fn_name() {
            $atomic.fetch_add(1, Ordering::Relaxed);
            #[cfg(feature = "telemetry")]
            {
                use opentelemetry::metrics::Counter;
                use std::sync::OnceLock;
                static C: OnceLock<Counter<u64>> = OnceLock::new();
                C.get_or_init(|| {
                    opentelemetry::global::meter("atomic-server")
                        .u64_counter($metric)
                        .with_description($desc)
                        .build()
                })
                .add(1, &[]);
            }
        }
    };
}

counter!(
    commit_applied,
    COMMITS_APPLIED,
    "commits.applied",
    "Commits applied to the store"
);
counter!(
    resource_fetched_http,
    RESOURCES_FETCHED_HTTP,
    "resources.fetched.http",
    "Resources fetched via HTTP GET"
);
counter!(
    search_performed,
    SEARCH_QUERIES,
    "search.queries",
    "Full-text search queries performed"
);
counter!(
    drive_created,
    DRIVES_CREATED,
    "drives.created",
    "Drive resources created"
);
