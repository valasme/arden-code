//! Resolve Codex's native program without interpreting npm or shell wrapper text.

use std::ffi::OsStr;
use std::io::Read;
use std::path::{Path, PathBuf};

use arden_process::resolve::{Lookup, Resolved};
use serde::Deserialize;

/// The program the driver may start, and the release an npm installation declares.
#[derive(Debug, Clone)]
pub struct Located {
    pub program: Resolved,
    pub package_version: Option<String>,
}

/// An installation can exist without a native program that may safely receive a prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Missing {
    NotInstalled,
    NativeProgram,
}

fn native(path: &Path) -> bool {
    let mut header = [0_u8; 4];
    std::fs::File::open(path)
        .and_then(|mut file| file.read_exact(&mut header))
        .is_ok_and(|()| {
            if cfg!(windows) {
                header.starts_with(b"MZ")
            } else {
                &header == b"\x7fELF"
            }
        })
}

fn package_version(package: &Path) -> Option<String> {
    #[derive(Deserialize)]
    struct Package {
        version: String,
    }
    let file = std::fs::File::open(package.join("package.json")).ok()?;
    let package: Package = serde_json::from_reader(file.take(32 * 1024)).ok()?;
    (crate::detect::parse_version(&package.version).as_ref() == Some(&package.version))
        .then_some(package.version)
}

fn platform() -> Option<(&'static str, &'static str)> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some(("win32-x64", "x86_64-pc-windows-msvc")),
        ("windows", "aarch64") => Some(("win32-arm64", "aarch64-pc-windows-msvc")),
        ("linux", "x86_64") => Some(("linux-x64", "x86_64-unknown-linux-musl")),
        ("linux", "aarch64") => Some(("linux-arm64", "aarch64-unknown-linux-musl")),
        _ => None,
    }
}

fn npm_program(package: &Path) -> Option<Located> {
    let version = package_version(package)?;
    let (platform, target) = platform()?;
    let executable = format!("vendor/{target}/bin/codex{}", std::env::consts::EXE_SUFFIX);
    let optional = format!("node_modules/@openai/codex-{platform}");
    let hoisted = package.parent()?.join(format!("codex-{platform}"));
    let candidates = [
        package.join(optional).join(&executable),
        hoisted.join(&executable),
        package.join(&executable),
    ];
    let path = candidates.into_iter().find(|path| native(path))?;
    Some(Located {
        program: Resolved {
            path,
            kind: arden_process::resolve::ProgramKind::Executable,
        },
        package_version: Some(version),
    })
}

/// Finds a native Codex or the native optional package behind npm's entry point. The wrapper is
/// never read or launched. A symlink to npm's JavaScript entry point is followed only as a path.
///
/// # Errors
///
/// Distinguishes an absent entry point from an installation without a supported native program.
pub fn find(search_path: &OsStr, lookup: &Lookup) -> Result<Located, Missing> {
    let found = lookup
        .find("codex", search_path)
        .ok_or(Missing::NotInstalled)?;
    if native(&found.path) {
        return Ok(Located {
            program: found,
            package_version: None,
        });
    }
    let package = if cfg!(windows) {
        found
            .path
            .parent()
            .map(|prefix| prefix.join("node_modules/@openai/codex"))
    } else {
        std::fs::canonicalize(&found.path)
            .ok()
            .and_then(|path| path.parent()?.parent().map(PathBuf::from))
    };
    package
        .as_deref()
        .and_then(npm_program)
        .ok_or(Missing::NativeProgram)
}

/// Resolves the person's installation from the application's environment.
///
/// # Errors
///
/// Reports the same installation failures as [`find`].
pub fn from_environment() -> Result<Located, Missing> {
    find(
        &std::env::var_os("PATH").unwrap_or_default(),
        &Lookup::of_this_platform(),
    )
}
