use crate::{
    appstate::AppState,
    context::RequestContext,
    errors::AtomicServerResult,
    helpers::get_client_agent,
    metrics::{self, MetricsSnapshot},
};
use actix_web::{web, HttpRequest, HttpResponse};
use atomic_lib::{Storelike, Subject};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
pub struct SystemAnalyticsParams {
    pub subject: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HostSystemStats {
    pub load_avg_1m: Option<f64>,
    pub load_avg_5m: Option<f64>,
    pub load_avg_15m: Option<f64>,
    pub memory_total_bytes: Option<u64>,
    pub memory_available_bytes: Option<u64>,
    pub memory_used_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerAnalytics {
    pub node_id: String,
    pub device_name: Option<String>,
    pub live: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveAnalytics {
    pub subject: String,
    pub name: Option<String>,
    pub resource_count: u64,
    pub blob_bytes: u64,
    pub loro_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAnalyticsResponse {
    pub version: &'static str,
    pub node_id: Option<String>,
    pub uptime_seconds: u64,
    pub timestamp_ms: u64,
    pub metrics: MetricsSnapshot,
    pub host: HostSystemStats,
    pub peers: Vec<PeerAnalytics>,
    pub live_peer_count: usize,
    pub known_peer_count: usize,
    pub drive_usage: Option<DriveAnalytics>,
}

pub fn parse_proc_loadavg(content: &str) -> (Option<f64>, Option<f64>, Option<f64>) {
    let mut parts = content.split_whitespace();
    let one = parts.next().and_then(|s| s.parse::<f64>().ok());
    let five = parts.next().and_then(|s| s.parse::<f64>().ok());
    let fifteen = parts.next().and_then(|s| s.parse::<f64>().ok());
    (one, five, fifteen)
}

pub fn parse_proc_meminfo(content: &str) -> (Option<u64>, Option<u64>, Option<u64>) {
    let mut total_kb: Option<u64> = None;
    let mut avail_kb: Option<u64> = None;
    let mut free_kb: Option<u64> = None;

    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            total_kb = rest
                .split_whitespace()
                .next()
                .and_then(|s| s.parse::<u64>().ok());
        } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
            avail_kb = rest
                .split_whitespace()
                .next()
                .and_then(|s| s.parse::<u64>().ok());
        } else if let Some(rest) = line.strip_prefix("MemFree:") {
            free_kb = rest
                .split_whitespace()
                .next()
                .and_then(|s| s.parse::<u64>().ok());
        }
    }

    let total_bytes = total_kb.map(|k| k.saturating_mul(1024));
    let available_bytes = avail_kb.or(free_kb).map(|k| k.saturating_mul(1024));
    let used_bytes = match (total_bytes, available_bytes) {
        (Some(total), Some(avail)) => Some(total.saturating_sub(avail)),
        _ => None,
    };

    (total_bytes, available_bytes, used_bytes)
}

fn read_host_stats() -> HostSystemStats {
    #[cfg(target_os = "linux")]
    {
        let (load_avg_1m, load_avg_5m, load_avg_15m) = std::fs::read_to_string("/proc/loadavg")
            .map(|c| parse_proc_loadavg(&c))
            .unwrap_or((None, None, None));

        let (memory_total_bytes, memory_available_bytes, memory_used_bytes) =
            std::fs::read_to_string("/proc/meminfo")
                .map(|c| parse_proc_meminfo(&c))
                .unwrap_or((None, None, None));

        HostSystemStats {
            load_avg_1m,
            load_avg_5m,
            load_avg_15m,
            memory_total_bytes,
            memory_available_bytes,
            memory_used_bytes,
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        HostSystemStats {
            load_avg_1m: None,
            load_avg_5m: None,
            load_avg_15m: None,
            memory_total_bytes: None,
            memory_available_bytes: None,
            memory_used_bytes: None,
        }
    }
}

fn collect_peers(store: &atomic_lib::Db) -> (Vec<PeerAnalytics>, usize, usize) {
    let live = crate::iroh_transport::live_peer_ids();
    let known = crate::iroh_transport::get_known_peers(store);

    let mut peers = Vec::new();
    for id in &live {
        let device_name = crate::iroh_transport::live_peer_name(id).or_else(|| {
            known
                .iter()
                .find(|p| crate::iroh_transport::normalize_node_id(&p.node_id) == *id)
                .map(|p| p.name.clone())
                .filter(|n| !n.is_empty())
        });
        peers.push(PeerAnalytics {
            node_id: format!("did:ad:node:{id}"),
            device_name,
            live: true,
        });
    }

    for peer in &known {
        let id = crate::iroh_transport::normalize_node_id(&peer.node_id);
        let did = format!("did:ad:node:{id}");
        if peers.iter().any(|p| p.node_id == did) {
            continue;
        }
        peers.push(PeerAnalytics {
            node_id: did,
            device_name: Some(peer.name.clone()).filter(|n| !n.is_empty()),
            live: false,
        });
    }

    (peers, live.len(), known.len())
}

/// `GET /system-analytics?subject=<optional-drive>` — live server, host, peer,
/// and optional drive analytics for the idle dashboard / Fire OS DreamService.
#[tracing::instrument(skip_all)]
pub async fn handle_system_analytics(
    appstate: web::Data<AppState>,
    params: web::Query<SystemAnalyticsParams>,
    req: HttpRequest,
) -> AtomicServerResult<HttpResponse> {
    let store = &appstate.store;
    let origin = RequestContext::new(&req, &appstate).origin;

    let drive_usage = if let Some(subject) = params.subject.as_deref().filter(|s| !s.is_empty()) {
        let full_url = format!("{}{}", origin, req.uri());
        match get_client_agent(req.headers(), &appstate, &full_url).await {
            Ok(for_agent) => {
                let subj = Subject::from(subject);
                match store.get_resource(&subj).await {
                    Ok(drive) => {
                        if atomic_lib::hierarchy::check_read(store, &drive, &for_agent)
                            .await
                            .is_ok()
                        {
                            store
                                .per_drive_usage(&[subject.to_string()])
                                .await
                                .ok()
                                .and_then(|rows| rows.into_iter().next())
                                .map(|row| DriveAnalytics {
                                    subject: row.drive_subject,
                                    name: row.name,
                                    resource_count: row.resource_count,
                                    blob_bytes: row.blob_bytes,
                                    loro_bytes: row.loro_bytes,
                                })
                        } else {
                            None
                        }
                    }
                    Err(_) => None,
                }
            }
            Err(_) => None,
        }
    } else {
        None
    };

    let (peers, live_peer_count, known_peer_count) = collect_peers(store);
    let node_id = crate::iroh_transport::get_node_id().map(|id| format!("did:ad:node:{id}"));
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(HttpResponse::Ok().json(SystemAnalyticsResponse {
        version: env!("CARGO_PKG_VERSION"),
        node_id,
        uptime_seconds: appstate.started_at.elapsed().as_secs(),
        timestamp_ms,
        metrics: metrics::snapshot(),
        host: read_host_stats(),
        peers,
        live_peer_count,
        known_peer_count,
        drive_usage,
    }))
}

#[cfg(test)]
mod tests {
    use super::{parse_proc_loadavg, parse_proc_meminfo};

    #[test]
    fn parses_proc_loadavg() {
        let sample = "0.42 0.37 0.29 2/612 12345\n";
        assert_eq!(parse_proc_loadavg(sample), (Some(0.42), Some(0.37), Some(0.29)));
    }

    #[test]
    fn parses_proc_meminfo() {
        let sample = "\
MemTotal:       16384000 kB
MemFree:         2048000 kB
MemAvailable:    8192000 kB
Buffers:          512000 kB
";
        let (total, avail, used) = parse_proc_meminfo(sample);
        assert_eq!(total, Some(16384000 * 1024));
        assert_eq!(avail, Some(8192000 * 1024));
        assert_eq!(used, Some((16384000 - 8192000) * 1024));
    }
}
