//! Codex through the person's own app-server, with its native protocol and policies (ADR 0065).

pub mod driver;
pub mod locate;
mod rpc;

#[cfg(test)]
mod tests;

/// Checks the actual negotiated protocol, not an invented minimum version. Account fields stay
/// inside the RPC seam; the app receives only readiness and a possible signed-in flag.
pub(crate) fn probe(
    supervisor: &arden_process::supervisor::Supervisor,
    located: &locate::Located,
    version: Option<&str>,
) -> (crate::detect::Readiness, Option<bool>) {
    use crate::detect::Readiness;
    if version.is_none() {
        return (Readiness::Unknown, None);
    }
    if located
        .package_version
        .as_deref()
        .is_some_and(|expected| Some(expected) != version)
    {
        return (Readiness::Incompatible, None);
    }
    let Some(folder) = located.program.path.parent() else {
        return (Readiness::Unknown, None);
    };
    let Ok(mut client) = rpc::Client::launch(supervisor, &located.program, folder) else {
        return (Readiness::Unknown, None);
    };
    if let Err(error) = client.initialize(&|| false) {
        return (
            if matches!(
                error,
                rpc::Error::Remote | rpc::Error::Protocol | rpc::Error::Unsupported
            ) {
                Readiness::Incompatible
            } else {
                Readiness::Unknown
            },
            None,
        );
    }
    match client.signed_in(&|| false) {
        Ok(Some(false)) => (Readiness::SignedOut, Some(false)),
        Ok(signed_in) => (Readiness::Ready, signed_in),
        Err(_) => (Readiness::Unknown, None),
    }
}
