# OAuth Tester

## Overview

This is a simple node app that provides a means of testing an OAuth 2.0 authorization code flow against any authorization server. It demonstrates signing in (which fetches an authorization code), exchanging the code for a token, and refreshing a token.

The app implements the authorization code grant per [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749), including:

-   A cryptographically random `state` parameter, generated and verified server-side (section 10.12)
-   PKCE (`code_challenge` / `code_verifier`, S256 method) per [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636). Servers that do not support PKCE are required to ignore the extra parameters, so this is safe to leave on.
-   Handling of `error` / `error_description` responses on both the redirect and the token endpoint (sections 4.1.2.1 and 5.2)

## Setup

### At Your OAuth Provider

-   Create/register an API app (client)
-   Set the redirect_uri to [http://localhost:4000/api/v1/oauth_handler/](http://localhost:4000/api/v1/oauth_handler/)
-   Note the client_id and client_secret (you will enter them in the oauth_test app later)

### Workspace

-   Clone the repo
-   nvm use (Node 18 or later is required)
-   yarn
-   yarn start

### Browser

-   Browse to [http://localhost:4000](http://localhost:4000)
-   Enter a name for the configuration, the authorize URL, the token URL, the client_id and client_secret (from your API app), and an optional scope
-   You can then begin to use the oauth_test application

### Development Environment

I have used Visual Studio Code as my editor for developing and testing the app. I have the [prettier](https://prettier.io/) extension installed and there is a .prettierrc file to configure it.

#### Prettier

The prettier extension formats the code on each save.

## Using The App

### Configure

The first time you open the app, you will be presented with a setup dialog asking for:

-   **Config Name** — any name you like; multiple configurations can be stored
-   **Authorize URL** — the full URL of the provider's authorization endpoint (e.g. `https://yourhost.com/oauth/authorize`)
-   **Token URL** — the full URL of the provider's token endpoint (e.g. `https://yourhost.com/oauth/token`)
-   **Client ID** / **Client Secret** — from the API app you registered with the provider
-   **Scope** (optional) — space-separated scopes to request

Enter these values and press the **OK** button to continue.

NOTE: You can reconfigure the app at any time by pressing the gear icon in the upper right of the window. This will bring up the setup dialog where you can change any/all of the configuration items.

NOTE: Databases created by older versions of this app (which stored a single provider `base_url`) are migrated automatically on startup.

### Login

After entering your credentials, you will see a **Login** button. Pressing the Login button will initiate the OAuth flow. The app server generates the `state` and PKCE values, then the browser is redirected to the configured authorize URL. Complete the login and control will be returned back to the OAuth tester app (to the oauth_handler end point) where we will save the code and then display it on the app.

### Exchange Code For Token

After the authorization code is obtained, it is displayed on the app. Normally, this step would be invisible to the user, but I wanted to visualize all of the steps in the process. Press the **Request Token** button to cause the app to exchange the code for an OAuth token.

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

After a token has been obtained, you can refresh the token by pressing the **Refresh Token** button. This will perform a refresh token flow exchange with the token endpoint, store the new token (with associated meta data) and display the new token.

### Delete The Token

At any time after obtaining a token, you can delete it from the app by pressing the **Delete Token** button. This simply removes it from the app. It **_does not_** invalidate or revoke the token with the authorization server.
