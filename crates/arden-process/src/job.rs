//! A Windows Job Object that ends its processes when it is closed.
//!
//! Every program Arden Code starts is put in one job. When the last handle to the job closes, which
//! happens when Arden Code ends, whether it closed normally, crashed, or was ended from Task
//! Manager, Windows ends every process in it. So no agent is left running with nobody watching it.

use std::io;
use std::process::Child;

/// A job whose processes end when it is dropped.
#[derive(Debug)]
pub struct Job {
    #[cfg(windows)]
    handle: windows::Win32::Foundation::HANDLE,
}

// SAFETY: a job handle is a plain number that Windows accepts from any thread, and the job is only
// closed once, when this value is dropped.
#[cfg(windows)]
#[allow(unsafe_code)]
unsafe impl Send for Job {}
// SAFETY: as above; nothing here changes through a shared reference.
#[cfg(windows)]
#[allow(unsafe_code)]
unsafe impl Sync for Job {}

#[cfg(windows)]
impl Job {
    /// Makes a job that ends its processes when it is closed.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows refuses to make the job.
    #[allow(unsafe_code)]
    pub fn new() -> io::Result<Self> {
        use std::ffi::c_void;
        use std::mem::size_of;

        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::JobObjects::{
            CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };

        // SAFETY: these are plain Win32 calls. The arguments are valid for the length of each
        // call, and the handle is closed on the error path and otherwise by `Drop`.
        unsafe {
            let handle = CreateJobObjectW(None, None).map_err(io::Error::from)?;
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&raw const limits).cast::<c_void>(),
                u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
                    .map_err(|_| io::Error::other("the limits are too large"))?,
            );
            if let Err(error) = set {
                let _ = CloseHandle(handle);
                return Err(io::Error::from(error));
            }
            Ok(Self { handle })
        }
    }

    /// Puts a process in the job, from now on and with everything it starts.
    ///
    /// # Errors
    ///
    /// Returns an error when Windows refuses, for instance when the process already ended.
    #[allow(unsafe_code)]
    pub fn assign(&self, child: &Child) -> io::Result<()> {
        use std::os::windows::io::AsRawHandle;

        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::System::JobObjects::AssignProcessToJobObject;

        // SAFETY: the job handle is open until `self` is dropped, and the process handle stays
        // open for as long as `child` exists, which outlives this call.
        unsafe {
            AssignProcessToJobObject(self.handle, HANDLE(child.as_raw_handle()))
                .map_err(io::Error::from)
        }
    }
}

#[cfg(windows)]
impl Drop for Job {
    #[allow(unsafe_code)]
    fn drop(&mut self) {
        use windows::Win32::Foundation::CloseHandle;

        // SAFETY: the handle was made by `new` and is closed only here. Closing it is what ends
        // the processes in the job.
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

/// Without Windows there is no job, and nothing ends a process when the app ends.
#[cfg(not(windows))]
impl Job {
    /// Makes a job that does nothing.
    ///
    /// # Errors
    ///
    /// Never.
    #[allow(clippy::unnecessary_wraps)]
    pub fn new() -> io::Result<Self> {
        Ok(Self {})
    }

    /// Does nothing.
    ///
    /// # Errors
    ///
    /// Never.
    #[allow(clippy::unnecessary_wraps, clippy::unused_self)]
    pub fn assign(&self, _child: &Child) -> io::Result<()> {
        Ok(())
    }
}
