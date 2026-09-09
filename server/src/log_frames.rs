use crate::errors::AtomicServerResult;
use chrono::Utc;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameKind {
    Blip,
    Pip,
}

impl FrameKind {
    fn as_str(&self) -> &'static str {
        match self {
            FrameKind::Blip => "blip",
            FrameKind::Pip => "pip",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameFormat {
    Json,
    JsonAd,
    Turtle,
    Text,
    Binary,
}

impl FrameFormat {
    fn as_str(&self) -> &'static str {
        match self {
            FrameFormat::Json => "json",
            FrameFormat::JsonAd => "json-ad",
            FrameFormat::Turtle => "turtle",
            FrameFormat::Text => "text",
            FrameFormat::Binary => "binary",
        }
    }

    fn extension(&self) -> &'static str {
        match self {
            FrameFormat::Json | FrameFormat::JsonAd => "json",
            FrameFormat::Turtle => "ttl",
            FrameFormat::Text => "log",
            FrameFormat::Binary => "bin",
        }
    }
}

#[derive(Clone, Debug)]
pub struct FrameLogger {
    root: PathBuf,
}

impl FrameLogger {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn log_text(
        &self,
        kind: FrameKind,
        channel: &str,
        format: FrameFormat,
        payload: &str,
    ) -> AtomicServerResult<PathBuf> {
        self.log_bytes(kind, channel, format, payload.as_bytes())
    }

    pub fn log_bytes(
        &self,
        kind: FrameKind,
        channel: &str,
        format: FrameFormat,
        payload: &[u8],
    ) -> AtomicServerResult<PathBuf> {
        let mut path = self.root.clone();
        path.push(kind.as_str());
        path.push(format.as_str());
        fs::create_dir_all(&path)?;

        let file_name = format!(
            "{}-{}.{}",
            Utc::now().format("%Y%m%dT%H%M%S%.6fZ"),
            sanitize_filename::sanitize(channel),
            format.extension()
        );
        path.push(file_name);
        fs::write(&path, payload)?;
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_text_frame_using_format_extension() {
        let test_dir = std::env::temp_dir().join(format!(
            "atomic-server-frame-logger-{}",
            atomic_lib::utils::random_string(10)
        ));
        let logger = FrameLogger::new(test_dir.clone());

        let path = logger
            .log_text(
                FrameKind::Blip,
                "ws:text",
                FrameFormat::Text,
                "SUBSCRIBE /test",
            )
            .unwrap();

        assert!(path.starts_with(&test_dir));
        assert!(path.extension().unwrap() == "log");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "SUBSCRIBE /test");
        std::fs::remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn writes_binary_frame_using_binary_extension() {
        let test_dir = std::env::temp_dir().join(format!(
            "atomic-server-frame-logger-{}",
            atomic_lib::utils::random_string(10)
        ));
        let logger = FrameLogger::new(test_dir.clone());

        let payload = [0_u8, 159, 146, 150];
        let path = logger
            .log_bytes(FrameKind::Pip, "ws-binary", FrameFormat::Binary, &payload)
            .unwrap();

        assert!(path.extension().unwrap() == "bin");
        assert_eq!(std::fs::read(&path).unwrap(), payload);
        std::fs::remove_dir_all(test_dir).unwrap();
    }
}
