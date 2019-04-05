# OAuth Tester

## Overview

This is a simple node app that provides a means of testing the TSheets OAuth flow. It demonstrates fetching a code, exchanging the code for a token, and doing a refresh of a token.

## Setup

### In the TSheets App

 * Create a new API app (shazdev or lntxweb1)
 * Set the redirect\_uri to [http://localhost:3000/api/v1/oauth\_handler/](http://localhost:3000/api/v1/oauth\_handler/)
 * Note the client\_id and client\_secret (you will enter them in the oauth\_test app later)

### Workspace

 * Clone the repo
 * npm install
 * npm start
 
### Browser
 * Browse to [http://localhost:3000](http://localhost:3000)
 * Enter your username (url), client\_id and client\_secret (from the API app)
 * You can then begin to use the oauth_test application
 
