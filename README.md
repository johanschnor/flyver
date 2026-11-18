# Flyver – Unified Gmail Manager

Flyver is a Chrome extension that gathers several Gmail accounts in one popup.
You can read, reply to, send, mark as read and trash mail across all your
accounts, and the toolbar badge shows the total number of unread messages.

**Install from the Chrome Web Store:**
https://chromewebstore.google.com/detail/flyver-unified-gmail-mana/eihnabkolnifnoihmhpccgekaaelmmnd

Website: https://johanschnor.github.io/flyver/ · [Privacy policy](https://johanschnor.github.io/flyver/privacy.html) · [Support](https://johanschnor.github.io/flyver/support.html)

## Project structure

```
manifest.json          Extension manifest (Manifest V3)
background.js          Service worker: OAuth flow, token refresh, unread badge
src/popup/             Popup UI (popup.html, popup.js, popup.css)
src/icons/             Icons
libs/purify.min.js     DOMPurify (Apache-2.0 / MPL-2.0)
docs/                  Website (GitHub Pages): home, privacy policy, support
```

## Run it locally (unpacked)

1. Clone the repo:
   ```bash
   git clone https://github.com/johanschnor/flyver.git
   cd flyver
   ```
2. Open `chrome://extensions`, turn on **Developer mode**, click
   **Load unpacked** and choose the project folder.
3. Click the Flyver icon and add a Gmail account under Settings.

After a code change, click the reload icon on the Flyver card in
`chrome://extensions` and reopen the popup.

### How login works

Flyver supports several Gmail accounts at once, so it signs in with
`chrome.identity.launchWebAuthFlow` and the OAuth 2.0 implicit flow
(`response_type=token`). **No client secret is used or stored.** The client ID
in `background.js` is public by design.

Access tokens last about an hour. `background.js` renews them silently
(`prompt=none` + `login_hint`) before they expire. If that fails (for example
because the user signed out of Google), the account has to be signed in again
from Settings. Tokens are stored only in `chrome.storage.local` on the user's
own machine.

The `key` in `manifest.json` gives the unpacked extension the same ID as the
Web Store version (`eihnabkolnifnoihmhpccgekaaelmmnd`), so the existing OAuth
client and its redirect URI
`https://eihnabkolnifnoihmhpccgekaaelmmnd.chromiumapp.org/` work out of the box.

### Using your own OAuth client (optional)

If you fork Flyver under a different extension ID, create a Google Cloud
project, enable the **Gmail API**, create an OAuth client of type
**Web application** with the redirect URI
`https://<your-extension-id>.chromiumapp.org/`, and put its client ID in
`CLIENT_ID` in `background.js`. You don't need the client secret.

## Contributing

Contributions are welcome!

1. Fork the repo and create a branch: `git checkout -b my-change`.
2. Make your change and test it as an unpacked extension.
3. Never commit tokens, email addresses or other personal data.
4. Open a pull request that describes what you changed and why.

Found a bug or have an idea? Open an
[issue](https://github.com/johanschnor/flyver/issues).

## License

[MIT](LICENSE). `libs/purify.min.js` is
[DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 / MPL-2.0), and
`src/icons/sort-solid.svg` is from [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0).
