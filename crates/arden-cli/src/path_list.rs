//! Adding and removing one folder in a `PATH`-style list, which is a text of folders separated by
//! semicolons. The installer does this to the user's `PATH`; keeping it here, apart from the
//! registry, lets it be tested with plain text.

/// Whether two folders are the same one as Windows sees it: the case of letters and a closing
/// backslash do not matter.
fn same_folder(a: &str, b: &str) -> bool {
    let normal = |text: &str| text.trim().trim_end_matches(['\\', '/']).to_lowercase();
    normal(a) == normal(b)
}

/// The list with `folder` added at its end, or nothing when it is already in the list.
#[must_use]
pub fn with_entry(list: &str, folder: &str) -> Option<String> {
    if list.split(';').any(|entry| same_folder(entry, folder)) {
        return None;
    }
    let kept = list.trim_end_matches(';');
    Some(if kept.is_empty() {
        folder.to_owned()
    } else {
        format!("{kept};{folder}")
    })
}

/// The list without `folder`, or nothing when it was not in the list. Everything else stays as it
/// was, also entries that hold variables such as `%USERPROFILE%`.
#[must_use]
pub fn without_entry(list: &str, folder: &str) -> Option<String> {
    let entries: Vec<&str> = list.split(';').collect();
    if !entries.iter().any(|entry| same_folder(entry, folder)) {
        return None;
    }
    Some(
        entries
            .into_iter()
            .filter(|entry| !same_folder(entry, folder))
            .collect::<Vec<_>>()
            .join(";"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const BIN: &str = r"C:\Users\Ada\AppData\Local\Arden Code\bin";

    #[test]
    fn adds_the_folder_at_the_end() {
        assert_eq!(
            with_entry(r"C:\Tools;%USERPROFILE%\bin", BIN),
            Some(format!(r"C:\Tools;%USERPROFILE%\bin;{BIN}"))
        );
    }

    #[test]
    fn adds_to_an_empty_list_and_mends_a_list_that_ends_with_a_semicolon() {
        assert_eq!(with_entry("", BIN), Some(BIN.to_owned()));
        assert_eq!(
            with_entry(r"C:\Tools;", BIN),
            Some(format!(r"C:\Tools;{BIN}"))
        );
    }

    #[test]
    fn does_not_add_a_folder_that_is_already_there_in_any_spelling() {
        for list in [
            format!(r"C:\Tools;{BIN}"),
            BIN.to_uppercase(),
            format!(r"C:\Tools;{BIN}\"),
            format!(r"{BIN}/;C:\Tools"),
        ] {
            assert_eq!(with_entry(&list, BIN), None, "{list}");
        }
    }

    #[test]
    fn a_similar_folder_is_not_the_same_folder() {
        assert!(with_entry(&format!(r"{BIN}2"), BIN).is_some());
        assert!(with_entry(r"C:\Users\Ada\AppData\Local\Arden Code", BIN).is_some());
    }

    #[test]
    fn removes_only_the_folder_and_leaves_the_rest_as_it_was() {
        assert_eq!(
            without_entry(&format!(r"C:\Tools;{BIN};%USERPROFILE%\bin"), BIN),
            Some(r"C:\Tools;%USERPROFILE%\bin".to_owned())
        );
        assert_eq!(without_entry(BIN, BIN), Some(String::new()));
    }

    #[test]
    fn removes_every_copy_and_reports_nothing_to_do_when_it_is_not_there() {
        assert_eq!(
            without_entry(&format!(r"{BIN};C:\Tools;{}", BIN.to_uppercase()), BIN),
            Some(r"C:\Tools".to_owned())
        );
        assert_eq!(without_entry(r"C:\Tools;C:\Other", BIN), None);
    }

    #[test]
    fn adding_and_then_removing_gives_back_the_list_that_was_there() {
        let before = r"C:\Tools;%USERPROFILE%\bin;C:\Program Files\Git\cmd";

        let added = with_entry(before, BIN).expect("added");
        let removed = without_entry(&added, BIN).expect("removed");

        assert_eq!(removed, before);
    }
}
