//! The name of the system the app runs on, for the About page and the diagnostics bundle.

/// The name of the distribution as `/etc/os-release` gives it (`PRETTY_NAME`, or else `NAME` and
/// `VERSION`), with the kernel's release: `Ubuntu 24.04.5 LTS (Linux 6.8.0-45-generic)`.
#[must_use]
pub fn describe_linux(os_release: Option<&str>, kernel: Option<&str>) -> String {
    let field = |name: &str| {
        os_release?.lines().find_map(|line| {
            let value = line.strip_prefix(name)?.strip_prefix('=')?;
            let value = value.trim().trim_matches('"').trim_matches('\'').trim();
            (!value.is_empty()).then(|| value.to_owned())
        })
    };
    let distribution = field("PRETTY_NAME").or_else(|| {
        let name = field("NAME")?;
        Some(match field("VERSION") {
            Some(version) => format!("{name} {version}"),
            None => name,
        })
    });
    let kernel = kernel
        .map(str::trim)
        .filter(|release| !release.is_empty())
        .map(|release| format!("Linux {release}"));
    match (distribution, kernel) {
        (Some(distribution), Some(kernel)) => format!("{distribution} ({kernel})"),
        (Some(distribution), None) => distribution,
        (None, Some(kernel)) => kernel,
        (None, None) => "Linux (version unknown)".to_owned(),
    }
}

/// The system this runs on, such as `Ubuntu 24.04.5 LTS (Linux 6.8.0-45-generic)`.
#[must_use]
pub fn linux_version() -> String {
    let os_release = std::fs::read_to_string("/etc/os-release")
        .or_else(|_| std::fs::read_to_string("/usr/lib/os-release"))
        .ok();
    let kernel = std::fs::read_to_string("/proc/sys/kernel/osrelease").ok();
    describe_linux(os_release.as_deref(), kernel.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_is_named_by_its_distribution_and_kernel() {
        let os_release = "NAME=\"Ubuntu\"\nVERSION=\"24.04.5 LTS (Noble Numbat)\"\n\
                          PRETTY_NAME=\"Ubuntu 24.04.5 LTS\"\nID=ubuntu\n";

        assert_eq!(
            describe_linux(Some(os_release), Some("6.8.0-45-generic\n")),
            "Ubuntu 24.04.5 LTS (Linux 6.8.0-45-generic)"
        );
    }

    #[test]
    fn a_distribution_without_a_pretty_name_is_named_by_its_name_and_version() {
        assert_eq!(
            describe_linux(Some("NAME=Arch Linux\nID=arch\n"), Some("6.17.1-arch1-1")),
            "Arch Linux (Linux 6.17.1-arch1-1)"
        );
        assert_eq!(
            describe_linux(Some("NAME='Fedora Linux'\nVERSION='42'\n"), None),
            "Fedora Linux 42"
        );
    }

    #[test]
    fn what_is_missing_is_left_out() {
        assert_eq!(describe_linux(None, Some("6.17.0")), "Linux 6.17.0");
        assert_eq!(
            describe_linux(Some(""), Some("  ")),
            "Linux (version unknown)"
        );
        assert_eq!(describe_linux(None, None), "Linux (version unknown)");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_answers_with_its_kernel() {
        assert!(linux_version().contains("Linux"), "{}", linux_version());
    }
}
