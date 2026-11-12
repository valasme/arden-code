use super::*;
use arden_agents::detect::Readiness;
use arden_agents::model::AgentKind;

fn found(cli: AgentCli, installed: bool, readiness: Readiness) -> Detection {
    Detection {
        cli,
        installed,
        readiness,
        path: None,
        version: None,
        minimum_version: None,
        too_old: false,
        signed_in: None,
        install_url: String::new(),
    }
}

#[test]
fn codex_is_the_fallback_before_demo_only_when_ready_and_claude_is_unavailable() {
    let cache = Detections::default();
    assert_eq!(cache.default_agent(), AgentKind::Demo);
    for readiness in [
        Readiness::Missing,
        Readiness::Incompatible,
        Readiness::SignedOut,
        Readiness::Unknown,
    ] {
        cache.keep(vec![found(AgentCli::Codex, true, readiness)]);
        assert_eq!(cache.default_agent(), AgentKind::Demo);
    }
    cache.keep(vec![found(AgentCli::Codex, true, Readiness::Ready)]);
    assert_eq!(cache.default_agent(), AgentKind::Codex);
    cache.keep(vec![found(AgentCli::Codex, false, Readiness::Ready)]);
    assert_eq!(cache.default_agent(), AgentKind::Demo);
    cache.keep(vec![
        found(AgentCli::Codex, true, Readiness::Ready),
        found(AgentCli::Claude, true, Readiness::Unknown),
    ]);
    assert_eq!(
        cache.default_agent(),
        AgentKind::Claude,
        "keep the existing preference for installed Claude"
    );
}
