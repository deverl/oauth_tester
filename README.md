# OAuth Tester

## Overview

This is a simple node app that provides a means of testing an OAuth 2.0 authorization code flow against any authorization server. It demonstrates signing in (which fetches an authorization code), exchanging the code for a token, and refreshing a token.

The app implements the authorization code grant per [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749), including:

-   A cryptographically random `state` parameter, generated and verified server-side (section 10.12)
-   PKCE (`code_challenge` / `code_verifier`, S256 method) per [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636) on every authorization. Servers that do not support PKCE are required to ignore the extra parameters, so this is safe to leave on.
-   Handling of `error` / `error_description` responses on both the redirect and the token endpoint (sections 4.1.2.1 and 5.2)

### Confidential vs public clients (PKCE)

You can test both kinds of clients:

-   **Confidential client** — supply a **Client ID** and **Client Secret**. The app still sends PKCE parameters; the token request also includes `client_secret`.
-   **Public client** — check **Public client — no client secret (PKCE only)** in Settings. You can save a configuration without a client secret. Token and refresh requests omit `client_secret` and rely on the PKCE `code_verifier` (plus `client_id`) for the exchange.

Use a public-client configuration when the authorization server has no pre-registered client secret (for example, dynamic or native-style clients that authenticate with PKCE alone).

## Setup

### At Your OAuth Provider

-   Create/register an API app (client), unless you are testing a public / PKCE-only client that does not use a secret
-   Set the redirect_uri to [http://localhost:4000/api/v1/oauth_handler/](http://localhost:4000/api/v1/oauth_handler/)
-   Note the client_id and, if applicable, the client_secret (you will enter them in the oauth_test app later)

### Workspace

-   Clone the repo
-   nvm use (Node 18 or later is required)
-   yarn (or `npm install`)
-   yarn start (or `npm start`)

`npm start` / `yarn start` runs the app under [nodemon](https://nodemon.io/), which restarts the server when server-side files change (`app.js`, `bin/`, `routes/`, `server/`, `constants/`, `views/`). Static files under `public/` are picked up with a browser refresh. Use `npm run start:plain` if you want a one-shot `node` process without file watching.

### Browser

-   Browse to [http://localhost:4000](http://localhost:4000)
-   Enter a name for the configuration, the authorize URL, the token URL, the client_id, and either a client_secret or enable **Public client** for PKCE-only
-   Optionally set a scope, then press **Save**
-   You can then begin to use the oauth_test application

### Development Environment

I have used Visual Studio Code as my editor for developing and testing the app. I have the [prettier](https://prettier.io/) extension installed and there is a .prettierrc file to configure it.

#### Prettier

The prettier extension formats the code on each save.

## Using The App

### Configure

The first time you open the app, you will be presented with a settings dialog asking for:

-   **Config Name** — any name you like; multiple configurations can be stored
-   **Authorize URL** — the full URL of the provider's authorization endpoint (e.g. `https://yourhost.com/oauth/authorize`)
-   **Token URL** — the full URL of the provider's token endpoint (e.g. `https://yourhost.com/oauth/token`)
-   **Client ID** — from the API app you registered with the provider
-   **Client Secret** — required for confidential clients; leave empty / unused when **Public client** is checked. The field is masked by default; use the eye icon to reveal it.
-   **Public client — no client secret (PKCE only)** — when checked, the config can be saved without a client secret, and token/refresh calls omit `client_secret`
-   **Scope** (optional) — space-separated scopes to request

Enter these values and press **Save**. Save keeps the dialog open and sets the configuration as current; close with the **X** (or Escape) when you are done.

From Settings you can also:

-   Switch between stored configurations in the list
-   **New** — start a blank configuration
-   **Clone** — duplicate the current (or listed) configuration under a new name so you can tweak a few fields
-   Delete a configuration with the trash icon on a list row

NOTE: You can reopen Settings at any time by pressing the gear icon in the upper right of the window.

NOTE: Databases created by older versions of this app (which stored a single provider `base_url`) are migrated automatically on startup.

### Login

After a complete configuration is saved, you will see a **Login** button. Pressing Login initiates the OAuth flow. The app server generates the `state` and PKCE values (`code_verifier` stored server-side; `code_challenge` returned to the browser), then the browser is redirected to the configured authorize URL with `code_challenge` and `code_challenge_method=S256`. Complete the login and control returns to the OAuth tester app (the `oauth_handler` endpoint), where the code is saved and displayed.

### Exchange Code For Token

After the authorization code is obtained, it is displayed on the app. Normally, this step would be invisible to the user, but I wanted to visualize all of the steps in the process. Press the **Request Token** button to cause the app to exchange the code for an OAuth token. The token request always includes the PKCE `code_verifier` when one was stored for the flow; `client_secret` is included only for confidential clients.

The token will look something like this:

```
{
    "access_token": "S.2389238745923875923874598273495872394857987",
    "expires_in": 864000,
    "token_type": "bearer",
    "scope": "",
    "refresh_token": "S.9328745928374592734957923475972349857923874"
}
```

After the token is obtained, we embed it in a data structure that also contains some meta data about the expiration. We add a timestamp (in milliseconds) when the token expires, along with a human readable expiration date and time.

The token, and its associated meta data, are stored in the app and will be something like this:

```
{
    "token": {
        "access_token": "S.2389238745923875923874598273495872394857987",
        "expires_in": 864000,
        "token_type": "bearer",
        "scope": "",
        "refresh_token": "S.9328745928374592734957923475972349857923874"
    },
    "expire_time_ms": 1555196441245,
    "expiration": "Sat Apr 13 2019 23:00:41 GMT+0000 (UTC)"
}
```

### Refresh The Token

After a token has been obtained, you can refresh the token by pressing the **Refresh Token** button. This will perform a refresh token flow exchange with the token endpoint, store the new token (with associated meta data) and display the new token. As with the code exchange, `client_secret` is sent only when the configuration has one.

### Delete The Token

At any time after obtaining a token, you can delete it from the app by pressing the **Delete Token** button. This simply removes it from the app. It **_does not_** invalidate or revoke the token with the authorization server.
