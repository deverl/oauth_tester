# OAuth Tester

## Overview

This is a simple node app that provides a means of testing the QuickBooks Time OAuth flow. It demonstrates signing in to QuickBooks Time (which fetches a code), exchanging the code for a token, and doing a refresh of a token.

## Setup

### In the QuickBooks Time App

-   Create a new API app (amorweb-prd or armorweb01)
-   Set the redirect_uri to [http://localhost:4000/api/v1/oauth_handler/](http://localhost:4000/api/v1/oauth_handler/)
-   Note the client_id and client_secret (you will enter them in the oauth_test app later)

### Workspace

-   Clone the repo
-   nvm use
-   yarn
-   yarn start

### Browser

-   Browse to [http://localhost:4000](http://localhost:4000)
-   Enter your username (url), client_id and client_secret (from the API app)
-   You can then begin to use the oauth_test application

### Development Environment

I have used Visual Studio Code as my editor for developing and testing the app. I have the [prettier](https://prettier.io/) extension installed and there is a .prettierrc file to configure it.

#### Prettier

The prettier extension formats the code on each save.

## Using The App

### Configure

The first time you open the app, you will be presented with a screen asking you for your username, and server (armorweb01 or amorweb-prd) and your client_id and client_secret (from your API app in QuickBooks Time).

The dialog will look something like this:

<img src="https://github.intuit.com/dstokes1/oauth_test/blob/master/docs/images/setup-dialog.png" width="500">

Enter all of these values and press the **OK** button to continue.

NOTE: You can reconfigure the app at any time by pressing the gear icon in the upper right of the window. This will bring up the setup dialog where you can change any/all of the configuration items.

### Login

After entering your credentials, you will see a **Login** button. Pressing the Login button will initiate the OAuth flow. After saving the state in the node app server, the browser will be redirected to the authorize URL at QuickBooks Time. You will see the standard QuickBooks Time OAuth screens. Complete the login and control will be returned back to the OAuth tester app (to the handle_oauth end point) where we will save the code and then display it on the app.

### Exchange Code For Token

After the code is obtained from QuickBooks Time, it is displayed on the app. Normally, this step would be invisible to the user, but I wanted to visualize all of the steps in the process. Press the **Request Token** button to cause the app to exchange the code for an OAuth token.

The token will look something like this:

```
{
    "access_token": "S.2389238745923875923874598273495872394857987",
    "expires_in": 864000,
    "token_type": "bearer",
    "scope": "",
    "refresh_token": "S.9328745928374592734957923475972349857923874",
    "user_id": "239847",
    "company_id": "92387459",
    "client_url": "acmebirdseed",
    "client_type": "business"
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
        "refresh_token": "S.9328745928374592734957923475972349857923874",
        "user_id": "239847",
        "company_id": "92387459",
        "client_url": "acmebirdseed",
        "client_type": "exempt"
    },
    "expire_time_ms": 1555196441245,
    "expiration": "Sat Apr 13 2019 23:00:41 GMT+0000 (UTC)"
}
```

### Refresh The Token

After a token has been obtained, you can refresh the token by pressing the **Refresh Token** button. This will perform a refresh token flow exchange with the QuickBooks Time server, store the new token (with associated meta data) and display the new token.

### Delete The Token

At any time after obtaining a token, you can delete it from the app by pressing the **Delete Token** button. This simply removes it from the app. It **_does not_** invalidate or revoke the token with QuickBooks Time.
