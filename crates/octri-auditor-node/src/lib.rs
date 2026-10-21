//! Work runs on libuv's native worker pool, never Node's event loop.
use napi::{Task, bindgen_prelude::*};
use napi_derive::napi;

pub struct AuditorTask {
    request: String,
}
impl Task for AuditorTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> {
        Ok(octri_auditor::wire::dispatch(&self.request))
    }
    fn resolve(&mut self, _: Env, output: String) -> napi::Result<String> {
        Ok(output)
    }
}
#[napi]
pub fn execute(request: String) -> AsyncTask<AuditorTask> {
    AsyncTask::new(AuditorTask { request })
}
