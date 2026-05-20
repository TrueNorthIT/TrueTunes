use keyring::Entry;

const SERVICE: &str = "uk.co.truenorthit.truetunes";
const USER: &str = "sonos-session-token";

fn entry() -> keyring::Result<Entry> {
    Entry::new(SERVICE, USER)
}

pub fn load() -> Option<String> {
    entry().ok().and_then(|e| e.get_password().ok())
}

pub fn save(token: &str) -> keyring::Result<()> {
    entry()?.set_password(token)
}

pub fn clear() -> keyring::Result<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}
