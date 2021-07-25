var pxt;
(function (pxt) {
})(pxt || (pxt = {}));
(function (pxt) {
    var analytics;
    (function (analytics) {
        const defaultProps = {};
        const defaultMeasures = {};
        let enabled = false;
        function addDefaultProperties(props) {
            Object.keys(props).forEach(k => {
                if (typeof props[k] == "string") {
                    defaultProps[k] = props[k];
                }
                else {
                    defaultMeasures[k] = props[k];
                }
            });
        }
        analytics.addDefaultProperties = addDefaultProperties;
        function enable() {
            if (!pxt.aiTrackException || !pxt.aiTrackEvent || enabled)
                return;
            enabled = true;
            pxt.debug('setting up app insights');
            const te = pxt.tickEvent;
            pxt.tickEvent = function (id, data, opts) {
                if (te)
                    te(id, data, opts);
                if (opts === null || opts === void 0 ? void 0 : opts.interactiveConsent)
                    pxt.setInteractiveConsent(true);
                if (!data)
                    pxt.aiTrackEvent(id);
                else {
                    const props = Object.assign({}, defaultProps) || {};
                    const measures = Object.assign({}, defaultMeasures) || {};
                    Object.keys(data).forEach(k => {
                        if (typeof data[k] == "string")
                            props[k] = data[k];
                        else if (typeof data[k] == "number")
                            measures[k] = data[k];
                        else
                            props[k] = JSON.stringify(data[k] || '');
                    });
                    pxt.aiTrackEvent(id, props, measures);
                }
            };
            const rexp = pxt.reportException;
            pxt.reportException = function (err, data) {
                if (rexp)
                    rexp(err, data);
                const props = {
                    target: pxt.appTarget.id,
                    version: pxt.appTarget.versions.target
                };
                if (data)
                    pxt.Util.jsonMergeFrom(props, data);
                pxt.aiTrackException(err, 'exception', props);
            };
            const re = pxt.reportError;
            pxt.reportError = function (cat, msg, data) {
                if (re)
                    re(cat, msg, data);
                try {
                    throw msg;
                }
                catch (err) {
                    const props = {
                        target: pxt.appTarget.id,
                        version: pxt.appTarget.versions.target,
                        category: cat,
                        message: msg
                    };
                    if (data)
                        pxt.Util.jsonMergeFrom(props, data);
                    pxt.aiTrackException(err, 'error', props);
                }
            };
        }
        analytics.enable = enable;
    })(analytics = pxt.analytics || (pxt.analytics = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var AudioContextManager;
    (function (AudioContextManager) {
        let _frequency = 0;
        let _context; // AudioContext
        let _vco; // OscillatorNode;
        let _gain;
        let _mute = false; //mute audio
        function context() {
            if (!_context)
                _context = freshContext();
            return _context;
        }
        function freshContext() {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            if (window.AudioContext) {
                try {
                    // this call my crash.
                    // SyntaxError: audio resources unavailable for AudioContext construction
                    return new window.AudioContext();
                }
                catch (e) { }
            }
            return undefined;
        }
        function mute(mute) {
            if (!_context)
                return;
            _mute = mute;
            stop();
            if (mute && _vco) {
                _vco.disconnect();
                _gain.disconnect();
                _vco = undefined;
                _gain = undefined;
            }
        }
        AudioContextManager.mute = mute;
        function stop() {
            if (!_context)
                return;
            _gain.gain.setTargetAtTime(0, _context.currentTime, 0.015);
            _frequency = 0;
        }
        AudioContextManager.stop = stop;
        function frequency() {
            return _frequency;
        }
        AudioContextManager.frequency = frequency;
        function tone(frequency) {
            if (_mute)
                return;
            if (frequency < 0)
                return;
            _frequency = frequency;
            let ctx = context();
            if (!ctx)
                return;
            try {
                if (!_vco) {
                    _vco = ctx.createOscillator();
                    _vco.type = 'triangle';
                    _gain = ctx.createGain();
                    _gain.gain.value = 0;
                    _gain.connect(ctx.destination);
                    _vco.connect(_gain);
                    _vco.start(0);
                }
                _vco.frequency.linearRampToValueAtTime(frequency, _context.currentTime);
                _gain.gain.setTargetAtTime(.2, _context.currentTime, 0.015);
            }
            catch (e) {
                _vco = undefined;
                return;
            }
        }
        AudioContextManager.tone = tone;
    })(AudioContextManager = pxt.AudioContextManager || (pxt.AudioContextManager = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var auth;
    (function (auth) {
        const CSRF_TOKEN = "csrf-token";
        const AUTH_LOGIN_STATE = "auth:login-state";
        const AUTH_USER_STATE = "auth:user-state";
        const X_PXT_TARGET = "x-pxt-target";
        const DEV_BACKEND_DEFAULT = "";
        const DEV_BACKEND_PROD = "https://www.makecode.com";
        const DEV_BACKEND_STAGING = "https://staging.pxt.io";
        const DEV_BACKEND_LOCALHOST = "http://localhost:5500";
        const DEV_BACKEND = DEV_BACKEND_STAGING;
        let authDisabled = false;
        auth.DEFAULT_USER_PREFERENCES = () => ({
            highContrast: false,
            language: pxt.appTarget.appTheme.defaultLocale,
            reader: ""
        });
        let _client;
        function client() { return _client; }
        auth.client = client;
        class AuthClient {
            constructor() {
                this.initialUserPreferences_ = undefined;
                this.initialAuthCheck_ = undefined;
                // Set global instance.
                _client = this;
            }
            /**
             * Starts the process of authenticating the user against the given identity
             * provider. Upon success the backend will write an http-only session cookie
             * to the response, containing the authorization token. This cookie is not
             * accessible in code, but will be included in all subsequent http requests.
             * @param idp The id of the identity provider.
             * @param persistent Whether or not to remember this login across sessions.
             * @param callbackState The URL hash and params to return to after the auth
             *  flow completes.
             */
            async loginAsync(idp, persistent, callbackState = undefined) {
                var _a;
                if (!hasIdentity() || !idpEnabled(idp)) {
                    return;
                }
                callbackState = callbackState !== null && callbackState !== void 0 ? callbackState : NilCallbackState;
                const state = this.getState();
                // See if we have a valid access token already.
                if (!state.profile) {
                    await this.authCheckAsync();
                }
                const currIdp = (_a = state.profile) === null || _a === void 0 ? void 0 : _a.idp;
                // Check if we're already signed into this identity provider.
                if (currIdp === idp) {
                    pxt.debug(`loginAsync: Already signed into ${idp}.`);
                    return;
                }
                this.clearState();
                // Store some continuation state in local storage so we can return to what
                // the user was doing before signing in.
                const genId = () => (Math.PI * Math.random()).toString(36).slice(2);
                const stateObj = {
                    key: genId(),
                    callbackState,
                    callbackPathname: window.location.pathname,
                    idp,
                };
                const stateStr = JSON.stringify(stateObj);
                pxt.storage.setLocal(AUTH_LOGIN_STATE, stateStr);
                // Redirect to the login endpoint.
                const loginUrl = pxt.Util.stringifyQueryString('/api/auth/login', {
                    response_type: "token",
                    provider: idp,
                    persistent,
                    redirect_uri: `${window.location.origin}${window.location.pathname}?authcallback=1&state=${stateObj.key}`
                });
                const apiResult = await this.apiAsync(loginUrl);
                if (apiResult.success) {
                    pxt.tickEvent('auth.login.start', { 'provider': idp });
                    window.location.href = apiResult.resp.loginUrl;
                }
                else {
                    await this.onSignInFailed();
                }
            }
            /**
             * Sign out the user and clear the auth token cookie.
             */
            async logoutAsync() {
                if (!hasIdentity()) {
                    return;
                }
                pxt.tickEvent('auth.logout');
                // backend will clear the cookie token and pass back the provider logout endpoint.
                await this.apiAsync('/api/auth/logout');
                // Clear csrf token so we can no longer make authenticated requests.
                pxt.storage.removeLocal(CSRF_TOKEN);
                // Update state and UI to reflect logged out state.
                this.clearState();
                // Redirect to home screen.
                if (pxt.BrowserUtils.hasWindow()) {
                    window.location.href = `${window.location.origin}${window.location.pathname}`;
                }
            }
            async deleteProfileAsync() {
                var _a, _b;
                // only if we're logged in
                if (!await this.loggedInAsync()) {
                    return;
                }
                const userId = (_b = (_a = this.getState()) === null || _a === void 0 ? void 0 : _a.profile) === null || _b === void 0 ? void 0 : _b.id;
                const res = await this.apiAsync('/api/user', null, 'DELETE');
                if (res.err) {
                    await this.onApiError((res.err));
                }
                else {
                    try {
                        // Clear csrf token so we can no longer make authenticated requests.
                        pxt.storage.removeLocal(CSRF_TOKEN);
                        try {
                            await this.onProfileDeleted(userId);
                        }
                        catch (_c) {
                            pxt.tickEvent('auth.profile.cloudToLocalFailed');
                        }
                        // Update state and UI to reflect logged out state.
                        this.clearState();
                    }
                    finally {
                        pxt.tickEvent('auth.profile.deleted');
                    }
                }
            }
            async initialUserPreferencesAsync() {
                // only if we're logged in
                if (!await this.loggedInAsync()) {
                    return undefined;
                }
                if (!this.initialUserPreferences_) {
                    this.initialUserPreferences_ = this.fetchUserPreferencesAsync();
                }
                return this.initialUserPreferences_;
            }
            async userProfileAsync() {
                if (!await this.loggedInAsync()) {
                    return undefined;
                }
                const state = this.getState();
                return Object.assign({}, state.profile);
            }
            async userPreferencesAsync() {
                if (!await this.loggedInAsync()) {
                    return undefined;
                }
                const state = this.getState();
                return Object.assign({}, state.preferences);
            }
            /**
             * Checks to see if we're already logged in by trying to fetch user info from
             * the backend. If we have a valid auth token cookie, it will succeed.
             */
            authCheckAsync() {
                var _a;
                if (!hasIdentity()) {
                    return undefined;
                }
                // Fail fast if we don't have csrf token.
                if (!pxt.storage.getLocal(CSRF_TOKEN)) {
                    return undefined;
                }
                const state = this.getState();
                if ((_a = state.profile) === null || _a === void 0 ? void 0 : _a.id) {
                    if (!this.initialAuthCheck_) {
                        this.initialAuthCheck_ = Promise.resolve(state.profile);
                    }
                }
                else if (!this.initialAuthCheck_) {
                    // Optimistically try to fetch user profile. It will succeed if we have a valid
                    // session cookie. Upon success, virtual api state will be updated, and the UI
                    // will update accordingly.
                    this.initialAuthCheck_ = this.fetchUserAsync();
                }
                return this.initialAuthCheck_;
            }
            async loggedInAsync() {
                await this.authCheckAsync();
                return this.hasUserId();
            }
            async updateUserProfileAsync(opts) {
                if (!await this.loggedInAsync()) {
                    return false;
                }
                const state = this.getState();
                const result = await this.apiAsync('/api/user/profile', {
                    id: state.profile.id,
                    username: opts.username,
                    avatarUrl: opts.avatarUrl
                });
                if (result.success) {
                    // Set user profile from returned value
                    await this.setUserProfileAsync(result.resp);
                }
                return result.success;
            }
            async updateUserPreferencesAsync(newPref) {
                // Update our local state
                this.setUserPreferencesAsync(newPref);
                // If we're not logged in, non-persistent local state is all we'll use
                if (!await this.loggedInAsync()) {
                    return;
                }
                // If the user is logged in, save to cloud
                const result = await this.apiAsync('/api/user/preferences', newPref);
                if (result.success) {
                    pxt.debug("Updating local user preferences w/ cloud data after result of POST");
                    // Set user profile from returned value so we stay in-sync
                    this.setUserPreferencesAsync(result.resp);
                }
                else {
                    pxt.reportError("identity", "update preferences failed", result);
                }
            }
            /*protected*/ hasUserId() {
                var _a;
                if (!hasIdentity()) {
                    return false;
                }
                const state = this.getState();
                return !!((_a = state.profile) === null || _a === void 0 ? void 0 : _a.id);
            }
            async fetchUserAsync() {
                var _a;
                if (!hasIdentity()) {
                    return undefined;
                }
                const state = this.getState();
                // We already have a user, no need to get it again.
                if ((_a = state.profile) === null || _a === void 0 ? void 0 : _a.id) {
                    return state.profile;
                }
                const result = await this.apiAsync('/api/user/profile');
                if (result.success) {
                    const profile = result.resp;
                    await this.setUserProfileAsync(profile);
                    return profile;
                }
                return undefined;
            }
            async setUserProfileAsync(profile) {
                const wasLoggedIn = this.hasUserId();
                this.transformUserProfile(profile);
                const isLoggedIn = this.hasUserId();
                this.onUserProfileChanged();
                //pxt.data.invalidate(USER_PROFILE);
                if (isLoggedIn && !wasLoggedIn) {
                    await this.onSignedIn();
                    //pxt.data.invalidate(LOGGED_IN);
                }
                else if (!isLoggedIn && wasLoggedIn) {
                    await this.onSignedOut();
                    //pxt.data.invalidate(LOGGED_IN);
                }
            }
            async setUserPreferencesAsync(newPref) {
                // TODO is there a generic way to do this so we don't need to add new branches
                //  for each field that changes?
                var _a, _b, _c, _d;
                // remember old
                const oldPref = (_a = this.getState().preferences) !== null && _a !== void 0 ? _a : auth.DEFAULT_USER_PREFERENCES();
                // update
                this.transformUserPreferences(Object.assign(Object.assign({}, oldPref), newPref));
                // invalidate fields that change
                if ((oldPref === null || oldPref === void 0 ? void 0 : oldPref.highContrast) !== ((_b = this.getState().preferences) === null || _b === void 0 ? void 0 : _b.highContrast)) {
                    await this.onUserPreferencesChanged("high-contrast");
                }
                if ((oldPref === null || oldPref === void 0 ? void 0 : oldPref.language) !== ((_c = this.getState().preferences) === null || _c === void 0 ? void 0 : _c.language)) {
                    await this.onUserPreferencesChanged("language");
                }
                if ((oldPref === null || oldPref === void 0 ? void 0 : oldPref.reader) !== ((_d = this.getState().preferences) === null || _d === void 0 ? void 0 : _d.reader)) {
                    await this.onUserPreferencesChanged("immersive-reader");
                }
            }
            async fetchUserPreferencesAsync() {
                // Wait for the initial auth
                if (!await this.loggedInAsync()) {
                    return undefined;
                }
                const state = this.getState();
                const api = '/api/user/preferences';
                const result = await this.apiAsync(api);
                if (result.success) {
                    // Set user profile from returned value
                    if (result.resp) {
                        // Note the cloud should send partial information back if it is missing
                        // a field. So e.g. if the language has never been set in the cloud, it won't
                        // overwrite the local state.
                        this.setUserPreferencesAsync(result.resp);
                        // update our one-time promise for the initial load
                        return state.preferences;
                    }
                }
                else {
                    pxt.reportError("identity", `fetch ${api} failed:\n${JSON.stringify(result)}`);
                }
                return undefined;
            }
            /**
             * Updates user profile state and writes it to local storage.
             * Direct access to state$ allowed.
             */
            transformUserProfile(profile) {
                this.state$ = Object.assign(Object.assign({}, this.state$), { profile: Object.assign({}, profile) });
                this.saveState();
            }
            /**
             * Updates user preference state and writes it to local storage.
             * Direct access to state$ allowed.
             */
            transformUserPreferences(preferences) {
                this.state$ = Object.assign(Object.assign({}, this.state$), { preferences: Object.assign({}, preferences) });
                this.saveState();
            }
            /**
             * Read-only access to current state.
             * Direct access to state$ allowed.
             */
            /*private*/ getState() {
                if (!this.state$) {
                    this.loadState();
                    if (this.state$) {
                        this.setUserProfileAsync(this.state$.profile);
                        this.setUserPreferencesAsync(this.state$.preferences);
                    }
                }
                if (!this.state$) {
                    this.state$ = {};
                }
                return this.state$;
            }
            ;
            /**
             * Write auth state to local storage.
             * Direct access to state$ allowed.
             */
            saveState() {
                pxt.storage.setLocal(AUTH_USER_STATE, JSON.stringify(this.state$));
            }
            /**
             * Read cached auth state from local storage.
             * Direct access to state$ allowed.
             */
            loadState() {
                const str = pxt.storage.getLocal(AUTH_USER_STATE);
                if (str) {
                    try {
                        this.state$ = JSON.parse(str);
                    }
                    catch (_a) { }
                }
            }
            /**
             * Clear all auth state.
             * Direct access to state$ allowed.
             */
            clearState() {
                this.state$ = {};
                pxt.storage.removeLocal(AUTH_USER_STATE);
                this.onStateCleared().then(() => { });
            }
            /*protected*/ async apiAsync(url, data, method) {
                var _a;
                const headers = {};
                const csrfToken = pxt.storage.getLocal(CSRF_TOKEN);
                if (csrfToken) {
                    headers["authorization"] = `mkcd ${csrfToken}`;
                }
                headers[X_PXT_TARGET] = (_a = pxt.appTarget) === null || _a === void 0 ? void 0 : _a.id;
                url = pxt.BrowserUtils.isLocalHostDev() ? `${DEV_BACKEND}${url}` : url;
                return pxt.Util.requestAsync({
                    url,
                    headers,
                    data,
                    method: method ? method : data ? "POST" : "GET",
                    withCredentials: true, // Include cookies and authorization header in request, subject to CORS policy.
                }).then(r => {
                    return {
                        statusCode: r.statusCode,
                        resp: r.json,
                        success: Math.floor(r.statusCode / 100) === 2,
                        err: null
                    };
                }).catch(async (e) => {
                    if (!/logout/.test(url) && e.statusCode == 401) {
                        // 401/Unauthorized. logout now.
                        await this.logoutAsync();
                    }
                    return {
                        statusCode: e.statusCode,
                        err: e,
                        resp: null,
                        success: false
                    };
                });
            }
        }
        auth.AuthClient = AuthClient;
        const NilCallbackState = {
            hash: '',
            params: {}
        };
        async function loginCallback(qs) {
            let state;
            let callbackState = Object.assign({}, NilCallbackState);
            do {
                // Read and remove auth state from local storage
                const stateStr = pxt.storage.getLocal(AUTH_LOGIN_STATE);
                if (!stateStr) {
                    pxt.debug("Auth state not found in storge.");
                    break;
                }
                pxt.storage.removeLocal(AUTH_LOGIN_STATE);
                state = JSON.parse(stateStr);
                if (typeof state !== 'object') {
                    pxt.debug("Failed to parse auth state.");
                    break;
                }
                const stateKey = qs['state'];
                if (!stateKey || state.key !== stateKey) {
                    pxt.debug("Failed to get auth state for key");
                    break;
                }
                callbackState = Object.assign(Object.assign({}, NilCallbackState), state.callbackState);
                const error = qs['error'];
                if (error) {
                    // Possible values for 'error':
                    //  'invalid_request' -- Something is wrong with the request itself.
                    //  'access_denied'   -- The identity provider denied the request, or user canceled it.
                    const error_description = qs['error_description'];
                    pxt.tickEvent('auth.login.error', { 'error': error, 'provider': state.idp });
                    pxt.log(`Auth failed: ${error}:${error_description}`);
                    // TODO: Is it correct to clear continuation hash?
                    callbackState = Object.assign({}, NilCallbackState);
                    // TODO: Show a message to the user (via rewritten continuation path)?
                    break;
                }
                const authToken = qs['token'];
                if (!authToken) {
                    pxt.debug("Missing authToken in auth callback.");
                    break;
                }
                // Store csrf token in local storage. It is ok to do this even when
                // "Remember me" wasn't selected because this token is not usable
                // without its cookie-based counterpart. When "Remember me" is false,
                // the cookie is not persisted.
                pxt.storage.setLocal(CSRF_TOKEN, authToken);
                pxt.tickEvent('auth.login.success', { 'provider': state.idp });
            } while (false);
            // Clear url parameters and redirect to the callback location.
            const hash = callbackState.hash.startsWith('#') ? callbackState.hash : `#${callbackState.hash}`;
            const params = pxt.Util.stringifyQueryString('', callbackState.params);
            const pathname = state.callbackPathname.startsWith('/') ? state.callbackPathname : `/${state.callbackPathname}`;
            const redirect = `${pathname}${hash}${params}`;
            window.location.href = redirect;
        }
        auth.loginCallback = loginCallback;
        function identityProviders() {
            var _a, _b;
            return Object.keys(((_b = (_a = pxt.appTarget) === null || _a === void 0 ? void 0 : _a.cloud) === null || _b === void 0 ? void 0 : _b.cloudProviders) || {})
                .map(id => pxt.appTarget.cloud.cloudProviders[id])
                .filter(prov => prov.identity)
                .sort((a, b) => a.order - b.order);
        }
        auth.identityProviders = identityProviders;
        function identityProvider(id) {
            return identityProviders().filter(prov => prov.id === id).shift();
        }
        auth.identityProvider = identityProvider;
        function hasIdentity() {
            return !authDisabled && !pxt.BrowserUtils.isPxtElectron() && identityProviders().length > 0;
        }
        auth.hasIdentity = hasIdentity;
        function idpEnabled(idp) {
            return identityProviders().filter(prov => prov.id === idp).length > 0;
        }
        function enableAuth(enabled = true) {
            authDisabled = !enabled;
        }
        auth.enableAuth = enableAuth;
    })(auth = pxt.auth || (pxt.auth = {}));
})(pxt || (pxt = {}));
// Needs to be in its own file to avoid a circular dependency: util.ts -> main.ts -> util.ts
var pxt;
(function (pxt) {
    /**
     * Track an event.
     */
    pxt.tickEvent = function (id) { };
})(pxt || (pxt = {}));
/// <reference path="./tickEvent.ts" />
/// <reference path="./apptarget.ts" />
var ts;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        pxtc.__dummy = 42;
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
var pxtc = ts.pxtc;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        var Util;
        (function (Util) {
            function assert(cond, msg = "Assertion failed") {
                if (!cond) {
                    debugger;
                    throw new Error(msg);
                }
            }
            Util.assert = assert;
            function flatClone(obj) {
                if (obj == null)
                    return null;
                let r = {};
                Object.keys(obj).forEach((k) => { r[k] = obj[k]; });
                return r;
            }
            Util.flatClone = flatClone;
            function clone(v) {
                if (v == null)
                    return null;
                return JSON.parse(JSON.stringify(v));
            }
            Util.clone = clone;
            function htmlEscape(_input) {
                if (!_input)
                    return _input; // null, undefined, empty string test
                return _input.replace(/([^\w .!?\-$])/g, c => "&#" + c.charCodeAt(0) + ";");
            }
            Util.htmlEscape = htmlEscape;
            function htmlUnescape(_input) {
                if (!_input)
                    return _input; // null, undefined, empty string test
                return _input.replace(/(&#\d+;)/g, c => String.fromCharCode(Number(c.substr(2, c.length - 3))));
            }
            Util.htmlUnescape = htmlUnescape;
            function jsStringQuote(s) {
                return s.replace(/[^\w .!?\-$]/g, (c) => {
                    let h = c.charCodeAt(0).toString(16);
                    return "\\u" + "0000".substr(0, 4 - h.length) + h;
                });
            }
            Util.jsStringQuote = jsStringQuote;
            function jsStringLiteral(s) {
                return "\"" + jsStringQuote(s) + "\"";
            }
            Util.jsStringLiteral = jsStringLiteral;
            // Localization functions. Please port any modifications over to pxtsim/localization.ts
            let _localizeLang = "en";
            let _localizeStrings = {};
            let _translationsCache = {};
            //let _didSetlocalizations = false;
            //let _didReportLocalizationsNotSet = false;
            let localizeLive = false;
            function enableLiveLocalizationUpdates() {
                localizeLive = true;
            }
            Util.enableLiveLocalizationUpdates = enableLiveLocalizationUpdates;
            function liveLocalizationEnabled() {
                return localizeLive;
            }
            Util.liveLocalizationEnabled = liveLocalizationEnabled;
            /**
             * Returns the current user language, prepended by "live-" if in live mode
             */
            function localeInfo() {
                return `${localizeLive ? "live-" : ""}${userLanguage()}`;
            }
            Util.localeInfo = localeInfo;
            /**
             * Returns current user language iSO-code. Default is `en`.
             */
            function userLanguage() {
                return _localizeLang;
            }
            Util.userLanguage = userLanguage;
            // This function returns normalized language code
            // For example: zh-CN this returns ["zh-CN", "zh", "zh-cn"]
            // First two are valid crowdin\makecode locale code,
            // Last all lowercase one is just for the backup when reading user defined extensions & tutorials.
            function normalizeLanguageCode(code) {
                const langParts = /^(\w{2})-(\w{2}$)/i.exec(code);
                if (langParts && langParts[1] && langParts[2]) {
                    return [`${langParts[1].toLowerCase()}-${langParts[2].toUpperCase()}`, langParts[1].toLowerCase(),
                        `${langParts[1].toLowerCase()}-${langParts[2].toLowerCase()}`];
                }
                else {
                    return [(code || "en").toLowerCase()];
                }
            }
            Util.normalizeLanguageCode = normalizeLanguageCode;
            function setUserLanguage(localizeLang) {
                _localizeLang = normalizeLanguageCode(localizeLang)[0];
            }
            Util.setUserLanguage = setUserLanguage;
            function isUserLanguageRtl() {
                return /^ar|dv|fa|ha|he|ks|ku|ps|ur|yi/i.test(_localizeLang);
            }
            Util.isUserLanguageRtl = isUserLanguageRtl;
            Util.TRANSLATION_LOCALE = "pxt";
            function isTranslationMode() {
                return userLanguage() == Util.TRANSLATION_LOCALE;
            }
            Util.isTranslationMode = isTranslationMode;
            function _localize(s) {
                // Needs to be test in localhost / CLI
                /*if (!_didSetlocalizations && !_didReportLocalizationsNotSet) {
                    _didReportLocalizationsNotSet = true;
                    pxt.tickEvent("locale.localizationsnotset");
                    // pxt.reportError can't be used here because of order of file imports
                    // Just use console.error instead, and use an Error so stacktrace is reported
                    console.error(new Error("Attempted to translate a string before localizations were set"));
                }*/
                return _localizeStrings[s] || s;
            }
            Util._localize = _localize;
            function getLocalizedStrings() {
                return _localizeStrings;
            }
            Util.getLocalizedStrings = getLocalizedStrings;
            function setLocalizedStrings(strs) {
                //_didSetlocalizations = true;
                _localizeStrings = strs;
            }
            Util.setLocalizedStrings = setLocalizedStrings;
            function translationsCache() {
                return _translationsCache;
            }
            Util.translationsCache = translationsCache;
            function fmt_va(f, args) {
                if (args.length == 0)
                    return f;
                return f.replace(/\{([0-9]+)(\:[^\}]+)?\}/g, function (s, n, spec) {
                    let v = args[parseInt(n)];
                    let r = "";
                    let fmtMatch = /^:f(\d*)\.(\d+)/.exec(spec);
                    if (fmtMatch) {
                        let precision = parseInt(fmtMatch[2]);
                        let len = parseInt(fmtMatch[1]) || 0;
                        let fillChar = /^0/.test(fmtMatch[1]) ? "0" : " ";
                        let num = v.toFixed(precision);
                        if (len > 0 && precision > 0)
                            len += precision + 1;
                        if (len > 0) {
                            while (num.length < len) {
                                num = fillChar + num;
                            }
                        }
                        r = num;
                    }
                    else if (spec == ":x") {
                        r = "0x" + v.toString(16);
                    }
                    else if (v === undefined)
                        r = "(undef)";
                    else if (v === null)
                        r = "(null)";
                    else if (v.toString)
                        r = v.toString();
                    else
                        r = v + "";
                    if (spec == ":a") {
                        if (/^\s*[euioah]/.test(r.toLowerCase()))
                            r = "an " + r;
                        else if (/^\s*[bcdfgjklmnpqrstvwxz]/.test(r.toLowerCase()))
                            r = "a " + r;
                    }
                    else if (spec == ":s") {
                        if (v == 1)
                            r = "";
                        else
                            r = "s";
                    }
                    else if (spec == ":q") {
                        r = Util.htmlEscape(r);
                    }
                    else if (spec == ":jq") {
                        r = Util.jsStringQuote(r);
                    }
                    else if (spec == ":uri") {
                        r = encodeURIComponent(r).replace(/'/g, "%27").replace(/"/g, "%22");
                    }
                    else if (spec == ":url") {
                        r = encodeURI(r).replace(/'/g, "%27").replace(/"/g, "%22");
                    }
                    else if (spec == ":%") {
                        r = (v * 100).toFixed(1).toString() + '%';
                    }
                    return r;
                });
            }
            Util.fmt_va = fmt_va;
            function fmt(f, ...args) { return fmt_va(f, args); }
            Util.fmt = fmt;
            const locStats = {};
            function dumpLocStats() {
                const r = {};
                Object.keys(locStats).sort((a, b) => locStats[b] - locStats[a])
                    .forEach(k => r[k] = k);
                console.log('prioritized list of strings:');
                console.log(JSON.stringify(r, null, 2));
            }
            Util.dumpLocStats = dumpLocStats;
            let sForPlural = true;
            function lf_va(format, args) {
                if (!format)
                    return format;
                locStats[format] = (locStats[format] || 0) + 1;
                let lfmt = Util._localize(format);
                if (!sForPlural && lfmt != format && /\d:s\}/.test(lfmt)) {
                    lfmt = lfmt.replace(/\{\d+:s\}/g, "");
                }
                lfmt = lfmt.replace(/^\{(id|loc):[^\}]+\}/g, '');
                return fmt_va(lfmt, args);
            }
            Util.lf_va = lf_va;
            function lf(format, ...args) {
                return lf_va(format, args); // @ignorelf@
            }
            Util.lf = lf;
            /**
             * Similar to lf but the string do not get extracted into the loc file.
             */
            function rlf(format, ...args) {
                return lf_va(format, args); // @ignorelf@
            }
            Util.rlf = rlf;
            function lookup(m, key) {
                if (m.hasOwnProperty(key))
                    return m[key];
                return null;
            }
            Util.lookup = lookup;
            function isoTime(time) {
                let d = new Date(time * 1000);
                return Util.fmt("{0}-{1:f02.0}-{2:f02.0} {3:f02.0}:{4:f02.0}:{5:f02.0}", d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
            }
            Util.isoTime = isoTime;
            function userError(msg) {
                let e = new Error(msg);
                e.isUserError = true;
                throw e;
            }
            Util.userError = userError;
            // small deep equals for primitives, objects, arrays. returns error message
            function deq(a, b) {
                if (a === b)
                    return null;
                if (!a || !b)
                    return "Null value";
                if (typeof a == 'object' && typeof b == 'object') {
                    if (Array.isArray(a)) {
                        if (!Array.isArray(b)) {
                            return "Expected array";
                        }
                        if (a.length != b.length) {
                            return "Expected array of length " + a.length + ", got " + b.length;
                        }
                        for (let i = 0; i < a.length; i++) {
                            if (deq(a[i], b[i]) != null) {
                                return "Expected array value " + a[i] + " got " + b[i];
                            }
                        }
                        return null;
                    }
                    let ak = Object.keys(a);
                    let bk = Object.keys(a);
                    if (ak.length != bk.length) {
                        return "Expected " + ak.length + " keys, got " + bk.length;
                    }
                    for (let i = 0; i < ak.length; i++) {
                        if (!Object.prototype.hasOwnProperty.call(b, ak[i])) {
                            return "Missing key " + ak[i];
                        }
                        else if (deq(a[ak[i]], b[ak[i]]) != null) {
                            return "Expected value of " + ak[i] + " to be " + a[ak[i]] + ", got " + b[ak[i]];
                        }
                    }
                    return null;
                }
                return "Unable to compare " + a + ", " + b;
            }
            Util.deq = deq;
        })(Util = pxtc.Util || (pxtc.Util = {}));
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
const lf = ts.pxtc.Util.lf;
/// <reference path="tickEvent.ts" />
/// <reference path="apptarget.ts"/>
/// <reference path="commonutil.ts"/>
var ts;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        /**
         * atob replacement
         * @param s
         */
        pxtc.decodeBase64 = function (s) { return atob(s); };
        /**
         * bota replacement
         * @param s
         */
        pxtc.encodeBase64 = function (s) { return btoa(s); };
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
(function (ts) {
    var pxtc;
    (function (pxtc) {
        var Util;
        (function (Util) {
            class CancellationToken {
                constructor() {
                    this.pending = false;
                    this.cancelled = false;
                }
                startOperation() {
                    this.pending = true;
                }
                isRunning() {
                    return this.pending;
                }
                onProgress(progressHandler) {
                    this.progressHandler = progressHandler;
                }
                reportProgress(completed, total) {
                    if (this.progressHandler) {
                        this.progressHandler(completed, total);
                    }
                }
                cancel() {
                    this.cancelled = true;
                    this.pending = false;
                }
                cancelAsync() {
                    if (this.cancelled || !this.pending) {
                        this.cancelled = true;
                        this.pending = false;
                        return Promise.resolve();
                    }
                    this.cancelled = true;
                    this.deferred = new Promise(resolve => {
                        this.resolve = resolve;
                    });
                    return this.deferred;
                }
                isCancelled() {
                    return this.cancelled;
                }
                throwIfCancelled() {
                    if (this.isCancelled())
                        throw new Error();
                }
                resolveCancel() {
                    this.pending = false;
                    if (this.deferred) {
                        this.resolve();
                        this.deferred = undefined;
                        this.resolve = undefined;
                    }
                }
            }
            Util.CancellationToken = CancellationToken;
            function codalHash16(s) {
                // same hashing as https://github.com/lancaster-university/codal-core/blob/c1fe7a4c619683a50d47cb0c19d15b8ff3bd16a1/source/drivers/PearsonHash.cpp#L26
                const hashTable = [
                    251, 175, 119, 215, 81, 14, 79, 191, 103, 49, 181, 143, 186, 157, 0,
                    232, 31, 32, 55, 60, 152, 58, 17, 237, 174, 70, 160, 144, 220, 90, 57,
                    223, 59, 3, 18, 140, 111, 166, 203, 196, 134, 243, 124, 95, 222, 179,
                    197, 65, 180, 48, 36, 15, 107, 46, 233, 130, 165, 30, 123, 161, 209, 23,
                    97, 16, 40, 91, 219, 61, 100, 10, 210, 109, 250, 127, 22, 138, 29, 108,
                    244, 67, 207, 9, 178, 204, 74, 98, 126, 249, 167, 116, 34, 77, 193,
                    200, 121, 5, 20, 113, 71, 35, 128, 13, 182, 94, 25, 226, 227, 199, 75,
                    27, 41, 245, 230, 224, 43, 225, 177, 26, 155, 150, 212, 142, 218, 115,
                    241, 73, 88, 105, 39, 114, 62, 255, 192, 201, 145, 214, 168, 158, 221,
                    148, 154, 122, 12, 84, 82, 163, 44, 139, 228, 236, 205, 242, 217, 11,
                    187, 146, 159, 64, 86, 239, 195, 42, 106, 198, 118, 112, 184, 172, 87,
                    2, 173, 117, 176, 229, 247, 253, 137, 185, 99, 164, 102, 147, 45, 66,
                    231, 52, 141, 211, 194, 206, 246, 238, 56, 110, 78, 248, 63, 240, 189,
                    93, 92, 51, 53, 183, 19, 171, 72, 50, 33, 104, 101, 69, 8, 252, 83, 120,
                    76, 135, 85, 54, 202, 125, 188, 213, 96, 235, 136, 208, 162, 129, 190,
                    132, 156, 38, 47, 1, 7, 254, 24, 4, 216, 131, 89, 21, 28, 133, 37, 153,
                    149, 80, 170, 68, 6, 169, 234, 151
                ];
                // REF: https://en.wikipedia.org/wiki/Pearson_hashing
                function eightBitHash(s) {
                    let hash = 0;
                    for (let i = 0; i < s.length; i++) {
                        let c = s[i];
                        hash = hashTable[hash ^ c];
                    }
                    return hash;
                }
                function hashN(s, byteCount) {
                    // this hash is used by enum.isHash. So any modification should be considered a breaking change.
                    let hash;
                    const buffer = new Uint8Array(s.length); // TODO unicode
                    for (let i = 0; i < s.length; ++i) {
                        const c = s.charCodeAt(i);
                        buffer[i] = c & 0xff;
                    }
                    let res = 0;
                    for (let i = 0; i < byteCount; ++i) {
                        hash = eightBitHash(buffer);
                        res |= hash << (8 * i);
                        buffer[0] = (buffer[0] + 1) % 255;
                    }
                    return res;
                }
                if (!s)
                    return 0;
                return hashN(s, 2);
            }
            Util.codalHash16 = codalHash16;
            function bufferSerial(buffers, data = "", source = "?", maxBufLen = 255) {
                for (let i = 0; i < data.length; ++i) {
                    const char = data[i];
                    buffers[source] = (buffers[source] || "") + char;
                    if (char === "\n" || buffers[source].length > maxBufLen) {
                        let buffer = buffers[source];
                        buffers[source] = "";
                        window.postMessage({
                            type: "serial",
                            id: source,
                            data: buffer
                        }, "*");
                    }
                }
            }
            Util.bufferSerial = bufferSerial;
            function blobReadAsDataURL(blob) {
                if (!blob)
                    return Promise.resolve(undefined);
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = e => reject(e);
                    reader.readAsDataURL(blob);
                });
            }
            Util.blobReadAsDataURL = blobReadAsDataURL;
            function fileReadAsBufferAsync(f) {
                if (!f)
                    return Promise.resolve(null);
                else {
                    return new Promise((resolve, reject) => {
                        let reader = new FileReader();
                        reader.onerror = (ev) => resolve(null);
                        reader.onload = (ev) => resolve(new Uint8Array(reader.result));
                        reader.readAsArrayBuffer(f);
                    });
                }
            }
            Util.fileReadAsBufferAsync = fileReadAsBufferAsync;
            function fileReadAsTextAsync(f) {
                if (!f)
                    return Promise.resolve(null);
                else {
                    return new Promise((resolve, reject) => {
                        let reader = new FileReader();
                        reader.onerror = (ev) => resolve(null);
                        reader.onload = (ev) => resolve(reader.result);
                        reader.readAsText(f);
                    });
                }
            }
            Util.fileReadAsTextAsync = fileReadAsTextAsync;
            function repeatMap(n, fn) {
                n = n || 0;
                let r = [];
                for (let i = 0; i < n; ++i)
                    r.push(fn(i));
                return r;
            }
            Util.repeatMap = repeatMap;
            function listsEqual(a, b) {
                if (!a || !b || a.length !== b.length) {
                    return false;
                }
                for (let i = 0; i < a.length; i++) {
                    if (a[i] !== b[i]) {
                        return false;
                    }
                }
                return true;
            }
            Util.listsEqual = listsEqual;
            function oops(msg = "OOPS") {
                debugger;
                throw new Error(msg);
            }
            Util.oops = oops;
            function reversed(arr) {
                arr = arr.slice(0);
                arr.reverse();
                return arr;
            }
            Util.reversed = reversed;
            function iterMap(m, f) {
                Object.keys(m).forEach(k => f(k, m[k]));
            }
            Util.iterMap = iterMap;
            function mapMap(m, f) {
                let r = {};
                Object.keys(m).forEach(k => r[k] = f(k, m[k]));
                return r;
            }
            Util.mapMap = mapMap;
            function values(m) {
                return Object.keys(m || {}).map(k => m[k]);
            }
            Util.values = values;
            function pushRange(trg, src) {
                if (src)
                    for (let i = 0; i < src.length; ++i)
                        trg.push(src[i]);
            }
            Util.pushRange = pushRange;
            // TS gets lost in type inference when this is passed an array
            function concatArrayLike(arrays) {
                return concat(arrays);
            }
            Util.concatArrayLike = concatArrayLike;
            function concat(arrays) {
                let r = [];
                for (let i = 0; i < arrays.length; ++i) {
                    pushRange(r, arrays[i]);
                }
                return r;
            }
            Util.concat = concat;
            function isKV(v) {
                return !!v && typeof v === "object" && !Array.isArray(v);
            }
            function memcpy(trg, trgOff, src, srcOff, len) {
                if (srcOff === void 0)
                    srcOff = 0;
                if (len === void 0)
                    len = src.length - srcOff;
                for (let i = 0; i < len; ++i)
                    trg[trgOff + i] = src[srcOff + i];
            }
            Util.memcpy = memcpy;
            function uint8ArrayConcat(chunks) {
                let numbytes = 0;
                for (let c of chunks)
                    numbytes += c.length;
                let r = new Uint8Array(numbytes);
                let ptr = 0;
                for (let c of chunks) {
                    memcpy(r, ptr, c);
                    ptr += c.length;
                }
                return r;
            }
            Util.uint8ArrayConcat = uint8ArrayConcat;
            function jsonTryParse(s) {
                try {
                    return JSON.parse(s);
                }
                catch (e) {
                    return undefined;
                }
            }
            Util.jsonTryParse = jsonTryParse;
            function jsonMergeFrom(trg, src) {
                if (!src)
                    return;
                Object.keys(src).forEach(k => {
                    if (isKV(trg[k]) && isKV(src[k]))
                        jsonMergeFrom(trg[k], src[k]);
                    else
                        trg[k] = Util.clone(src[k]);
                });
            }
            Util.jsonMergeFrom = jsonMergeFrom;
            function jsonCopyFrom(trg, src) {
                let v = Util.clone(src);
                for (let k of Object.keys(src)) {
                    trg[k] = v[k];
                }
            }
            Util.jsonCopyFrom = jsonCopyFrom;
            // { a: { b: 1 }, c: 2} => { "a.b": 1, c: 2 }
            function jsonFlatten(v) {
                let res = {};
                let loop = (pref, v) => {
                    if (v !== null && typeof v == "object") {
                        Util.assert(!Array.isArray(v));
                        if (pref)
                            pref += ".";
                        for (let k of Object.keys(v)) {
                            loop(pref + k, v[k]);
                        }
                    }
                    else {
                        res[pref] = v;
                    }
                };
                loop("", v);
                return res;
            }
            Util.jsonFlatten = jsonFlatten;
            function jsonUnFlatten(v) {
                let res = {};
                for (let k of Object.keys(v)) {
                    let ptr = res;
                    let parts = k.split(".");
                    for (let i = 0; i < parts.length; ++i) {
                        let part = parts[i];
                        if (i == parts.length - 1)
                            ptr[part] = v[k];
                        else {
                            if (typeof ptr[part] != "object")
                                ptr[part] = {};
                            ptr = ptr[part];
                        }
                    }
                }
                return res;
            }
            Util.jsonUnFlatten = jsonUnFlatten;
            function strcmp(a, b) {
                if (a == b)
                    return 0;
                if (a < b)
                    return -1;
                else
                    return 1;
            }
            Util.strcmp = strcmp;
            function stringMapEq(a, b) {
                let ak = Object.keys(a);
                let bk = Object.keys(b);
                if (ak.length != bk.length)
                    return false;
                for (let k of ak) {
                    if (!b.hasOwnProperty(k))
                        return false;
                    if (a[k] !== b[k])
                        return false;
                }
                return true;
            }
            Util.stringMapEq = stringMapEq;
            function endsWith(str, suffix) {
                if (str.length < suffix.length)
                    return false;
                if (suffix.length == 0)
                    return true;
                return str.slice(-suffix.length) == suffix;
            }
            Util.endsWith = endsWith;
            function startsWith(str, prefix) {
                if (str.length < prefix.length)
                    return false;
                if (prefix.length == 0)
                    return true;
                return str.slice(0, prefix.length) == prefix;
            }
            Util.startsWith = startsWith;
            function contains(str, contains) {
                if (str.length < contains.length)
                    return false;
                if (contains.length == 0)
                    return true;
                return str.indexOf(contains) > -1;
            }
            Util.contains = contains;
            function replaceAll(str, old, new_) {
                if (!old)
                    return str;
                return str.split(old).join(new_);
            }
            Util.replaceAll = replaceAll;
            function snakify(s) {
                const up = s.toUpperCase();
                const lo = s.toLowerCase();
                // if the name is all lowercase or all upper case don't do anything
                if (s == up || s == lo)
                    return s;
                // if the name already has underscores (not as first character), leave it alone
                if (s.lastIndexOf("_") > 0)
                    return s;
                const isUpper = (i) => s[i] != lo[i];
                const isLower = (i) => s[i] != up[i];
                //const isDigit = (i: number) => /\d/.test(s[i])
                let r = "";
                let i = 0;
                while (i < s.length) {
                    let upperMode = isUpper(i);
                    let j = i;
                    while (j < s.length) {
                        if (upperMode && isLower(j)) {
                            // ABCd -> AB_Cd
                            if (j - i > 2) {
                                j--;
                                break;
                            }
                            else {
                                // ABdefQ -> ABdef_Q
                                upperMode = false;
                            }
                        }
                        // abcdE -> abcd_E
                        if (!upperMode && isUpper(j)) {
                            break;
                        }
                        j++;
                    }
                    if (r)
                        r += "_";
                    r += s.slice(i, j);
                    i = j;
                }
                // If the name is is all caps (like a constant), preserve it
                if (r.toUpperCase() === r) {
                    return r;
                }
                return r.toLowerCase();
            }
            Util.snakify = snakify;
            function sortObjectFields(o) {
                let keys = Object.keys(o);
                keys.sort(strcmp);
                let r = {};
                keys.forEach(k => r[k] = o[k]);
                return r;
            }
            Util.sortObjectFields = sortObjectFields;
            function chopArray(arr, chunkSize) {
                let res = [];
                for (let i = 0; i < arr.length; i += chunkSize)
                    res.push(arr.slice(i, i + chunkSize));
                return res;
            }
            Util.chopArray = chopArray;
            function unique(arr, f) {
                let v = [];
                let r = {};
                arr.forEach(e => {
                    let k = f(e);
                    if (!r.hasOwnProperty(k)) {
                        r[k] = null;
                        v.push(e);
                    }
                });
                return v;
            }
            Util.unique = unique;
            function groupBy(arr, f) {
                let r = {};
                arr.forEach(e => {
                    let k = f(e);
                    if (!r.hasOwnProperty(k))
                        r[k] = [];
                    r[k].push(e);
                });
                return r;
            }
            Util.groupBy = groupBy;
            function toDictionary(arr, f) {
                let r = {};
                arr.forEach(e => { r[f(e)] = e; });
                return r;
            }
            Util.toDictionary = toDictionary;
            function toSet(arr, f) {
                let r = {};
                arr.forEach(e => { r[f(e)] = true; });
                return r;
            }
            Util.toSet = toSet;
            function toArray(a) {
                if (Array.isArray(a)) {
                    return a;
                }
                let r = [];
                if (!a)
                    return r;
                for (let i = 0; i < a.length; ++i)
                    r.push(a[i]);
                return r;
            }
            Util.toArray = toArray;
            function indexOfMatching(arr, f) {
                for (let i = 0; i < arr.length; ++i)
                    if (f(arr[i]))
                        return i;
                return -1;
            }
            Util.indexOfMatching = indexOfMatching;
            const _nextTickResolvedPromise = Promise.resolve();
            function nextTick(f) {
                // .then should run as a microtask / at end of loop
                _nextTickResolvedPromise.then(f);
            }
            Util.nextTick = nextTick;
            async function delay(duration, value) {
                // eslint-disable-next-line
                const output = await value;
                await new Promise(resolve => setTimeout(() => resolve(), duration));
                return output;
            }
            Util.delay = delay;
            function promiseMapAll(values, mapper) {
                return Promise.all(values.map(v => mapper(v)));
            }
            Util.promiseMapAll = promiseMapAll;
            function promiseMapAllSeries(values, mapper) {
                return promisePoolAsync(1, values, mapper);
            }
            Util.promiseMapAllSeries = promiseMapAllSeries;
            async function promisePoolAsync(maxConcurrent, inputValues, handler) {
                let curr = 0;
                const promises = [];
                const output = [];
                for (let i = 0; i < maxConcurrent; i++) {
                    const thread = (async () => {
                        while (curr < inputValues.length) {
                            const id = curr++;
                            const input = inputValues[id];
                            output[id] = await handler(input);
                        }
                    })();
                    promises.push(thread);
                }
                try {
                    await Promise.all(promises);
                }
                catch (e) {
                    // do not spawn any more promises after pool failed.
                    curr = inputValues.length;
                    throw e;
                }
                return output;
            }
            Util.promisePoolAsync = promisePoolAsync;
            function memoizeString(createNew) {
                return memoize(s => s, createNew);
            }
            Util.memoizeString = memoizeString;
            async function promiseTimeout(ms, promise, msg) {
                let timeoutId;
                let res;
                const timeoutPromise = new Promise((resolve, reject) => {
                    res = resolve;
                    timeoutId = setTimeout(() => {
                        res = undefined;
                        clearTimeout(timeoutId);
                        reject(msg || `Promise timed out after ${ms}ms`);
                    }, ms);
                });
                return Promise.race([promise, timeoutPromise])
                    .then(output => {
                    // clear any dangling timeout
                    if (res) {
                        clearTimeout(timeoutId);
                        res();
                    }
                    return output;
                });
            }
            Util.promiseTimeout = promiseTimeout;
            function defer() {
                let result;
                let resolve;
                let reject;
                let isResolved = false;
                return {
                    resolve: function (value) {
                        if (isResolved) {
                            pxt.debug("Deferred promise already resolved");
                            return;
                        }
                        if (resolve) {
                            resolve(value);
                        }
                        else {
                            result = result || new Promise(function (r) { r(value); });
                        }
                        isResolved = true;
                    },
                    reject: function (reason) {
                        if (isResolved) {
                            pxt.debug("Deferred promise already resolved");
                            return;
                        }
                        if (reject) {
                            reject(reason);
                        }
                        else {
                            result = result || new Promise(function (_, j) { j(reason); });
                        }
                        isResolved = true;
                    },
                    promise: new Promise(function (r, j) {
                        if (result) {
                            r(result);
                        }
                        else {
                            resolve = r;
                            reject = j;
                        }
                    })
                };
            }
            Util.defer = defer;
            ;
            function memoize(getId, createNew) {
                const cache = {};
                return (v) => {
                    const id = getId(v);
                    if (cache.hasOwnProperty(id))
                        return cache[id];
                    return (cache[id] = createNew(v));
                };
            }
            Util.memoize = memoize;
            // Returns a function, that, as long as it continues to be invoked, will not
            // be triggered. The function will be called after it stops being called for
            // N milliseconds. If `immediate` is passed, trigger the function on the
            // leading edge, instead of the trailing.
            function debounce(func, wait, immediate) {
                let timeout;
                return function () {
                    let context = this;
                    let args = arguments;
                    let later = function () {
                        timeout = null;
                        if (!immediate)
                            func.apply(context, args);
                    };
                    let callNow = immediate && !timeout;
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                    if (callNow)
                        func.apply(context, args);
                    return timeout;
                };
            }
            Util.debounce = debounce;
            class AdaptiveDebouncer {
                constructor(func, minDelay = 300, maxDelay = 2000, slowdownFactor = 2) {
                    this.func = func;
                    this.minDelay = minDelay;
                    this.maxDelay = maxDelay;
                    this.slowdownFactor = slowdownFactor;
                    this.lastPoke = 0;
                    this.recentGaps = [];
                    this.wrapped = () => {
                        this.timeout = null;
                        this.func();
                    };
                }
                poke() {
                    const now = Date.now();
                    if (this.lastPoke) {
                        const gap = now - this.lastPoke;
                        if (gap < 10)
                            return; // ignore triggers is quick succession
                        if (gap < 4000)
                            this.recentGaps.push(gap);
                        while (this.recentGaps.length > 10)
                            this.recentGaps.shift();
                    }
                    this.lastPoke = now;
                }
                trigger() {
                    let delay = this.maxDelay;
                    if (this.lastPoke) {
                        const gaps = this.recentGaps.slice();
                        gaps.sort();
                        const median = gaps[gaps.length >> 1] || 1;
                        delay = Math.min(Math.max((median * this.slowdownFactor) | 0, this.minDelay), this.maxDelay);
                        const gap = Date.now() - this.lastPoke;
                        delay -= gap;
                        if (delay < 0)
                            delay = 0;
                        this.lastPoke = null;
                    }
                    clearTimeout(this.timeout);
                    this.timeout = setTimeout(this.wrapped, delay);
                }
            }
            Util.AdaptiveDebouncer = AdaptiveDebouncer;
            // Returns a function, that, as long as it continues to be invoked, will only
            // trigger every N milliseconds. If `immediate` is passed, trigger the
            // function on the leading edge, instead of the trailing.
            function throttle(func, wait, immediate) {
                let timeout;
                return function () {
                    let context = this;
                    let args = arguments;
                    let later = function () {
                        timeout = null;
                        if (!immediate)
                            func.apply(context, args);
                    };
                    let callNow = immediate && !timeout;
                    if (!timeout)
                        timeout = setTimeout(later, wait);
                    if (callNow)
                        func.apply(context, args);
                };
            }
            Util.throttle = throttle;
            function randomPermute(arr) {
                for (let i = 0; i < arr.length; ++i) {
                    let j = randomUint32() % arr.length;
                    let tmp = arr[i];
                    arr[i] = arr[j];
                    arr[j] = tmp;
                }
            }
            Util.randomPermute = randomPermute;
            function randomPick(arr) {
                if (arr.length == 0)
                    return null;
                return arr[randomUint32() % arr.length];
            }
            Util.randomPick = randomPick;
            function timeSince(time) {
                let now = Date.now();
                time *= 1000;
                let diff = (now - time) / 1000;
                if (isNaN(diff))
                    return "";
                if (diff < -30) {
                    diff = -diff;
                    if (diff < 60)
                        return Util.lf("in a few seconds");
                    if (diff < 2 * 60)
                        return Util.lf("in a minute");
                    if (diff < 60 * 60)
                        return Util.lf("in {0} minute{0:s}", Math.floor(diff / 60));
                    if (diff < 2 * 60 * 60)
                        return Util.lf("in an hour");
                    if (diff < 60 * 60 * 24)
                        return Util.lf("in {0} hour{0:s}", Math.floor(diff / 60 / 60));
                    if (diff < 60 * 60 * 24 * 30)
                        return Util.lf("in {0} day{0:s}", Math.floor(diff / 60 / 60 / 24));
                    if (diff < 60 * 60 * 24 * 365)
                        return Util.lf("in {0} month{0:s}", Math.floor(diff / 60 / 60 / 24 / 30));
                    return Util.lf("in {0} year{0:s}", Math.floor(diff / 60 / 60 / 24 / 365));
                }
                else {
                    if (diff < 0)
                        return Util.lf("now");
                    if (diff < 10)
                        return Util.lf("a few seconds ago");
                    if (diff < 60)
                        return Util.lf("{0} second{0:s} ago", Math.floor(diff));
                    if (diff < 2 * 60)
                        return Util.lf("a minute ago");
                    if (diff < 60 * 60)
                        return Util.lf("{0} minute{0:s} ago", Math.floor(diff / 60));
                    if (diff < 2 * 60 * 60)
                        return Util.lf("an hour ago");
                    if (diff < 60 * 60 * 24)
                        return Util.lf("{0} hour{0:s} ago", Math.floor(diff / 60 / 60));
                    if (diff < 60 * 60 * 24 * 30)
                        return Util.lf("{0} day{0:s} ago", Math.floor(diff / 60 / 60 / 24));
                    if (diff < 60 * 60 * 24 * 365)
                        return Util.lf("{0} month{0:s} ago", Math.floor(diff / 60 / 60 / 24 / 30));
                    return Util.lf("{0} year{0:s} ago", Math.floor(diff / 60 / 60 / 24 / 365));
                }
            }
            Util.timeSince = timeSince;
            function unicodeToChar(text) {
                let r = /\\u([\d\w]{4})/gi;
                return text.replace(r, function (match, grp) {
                    return String.fromCharCode(parseInt(grp, 16));
                });
            }
            Util.unicodeToChar = unicodeToChar;
            function escapeForRegex(str) {
                return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
            }
            Util.escapeForRegex = escapeForRegex;
            function stripUrlProtocol(str) {
                return str.replace(/.*?:\/\//g, "");
            }
            Util.stripUrlProtocol = stripUrlProtocol;
            function normalizePath(path) {
                if (path) {
                    path = path.replace(/\\/g, "/");
                }
                return path;
            }
            Util.normalizePath = normalizePath;
            function pathJoin(a, b) {
                normalizePath(a);
                normalizePath(b);
                if (!a && !b)
                    return undefined;
                else if (!a)
                    return b;
                else if (!b)
                    return a;
                if (a.charAt(a.length - 1) !== "/") {
                    a += "/";
                }
                if (b.charAt(0) == "/") {
                    b = b.substring(1);
                }
                return a + b;
            }
            Util.pathJoin = pathJoin;
            // Reliable NodeJS detection is not possible, but the following check should be accurate enough for our needs
            Util.isNodeJS = typeof window === "undefined";
            // debug flag
            //export let debugHttpRequests = false;
            function requestAsync(options) {
                //if (debugHttpRequests)
                //    pxt.debug(`>> ${options.method || "GET"} ${options.url.replace(/[?#].*/, "...")}`); // don't leak secrets in logs
                return Util.httpRequestCoreAsync(options)
                    .then(resp => {
                    //if (debugHttpRequests)
                    //    pxt.debug(`  << ${resp.statusCode}`);
                    const statusCode = resp.statusCode;
                    const successCodes = options.successCodes || [304, 200, 201, 202];
                    if (successCodes.indexOf(statusCode) < 0 && !options.allowHttpErrors) {
                        const msg = Util.lf("Bad HTTP status code: {0} at {1}; message: {2}", resp.statusCode, options.url, (resp.text || "").slice(0, 500));
                        const err = new Error(msg);
                        err.statusCode = resp.statusCode;
                        return Promise.reject(err);
                    }
                    if (resp.text && /application\/json/.test(resp.headers["content-type"]))
                        resp.json = pxtc.U.jsonTryParse(resp.text);
                    return resp;
                });
            }
            Util.requestAsync = requestAsync;
            function httpGetTextAsync(url) {
                return requestAsync({ url: url }).then(resp => resp.text);
            }
            Util.httpGetTextAsync = httpGetTextAsync;
            function httpGetJsonAsync(url) {
                return requestAsync({ url: url }).then(resp => resp.json);
            }
            Util.httpGetJsonAsync = httpGetJsonAsync;
            function httpPostJsonAsync(url, data) {
                return requestAsync({ url: url, data: data || {} }).then(resp => resp.json);
            }
            Util.httpPostJsonAsync = httpPostJsonAsync;
            // this will take lower 8 bits from each character
            function stringToUint8Array(input) {
                let len = input.length;
                let res = new Uint8Array(len);
                for (let i = 0; i < len; ++i)
                    res[i] = input.charCodeAt(i) & 0xff;
                return res;
            }
            Util.stringToUint8Array = stringToUint8Array;
            function uint8ArrayToString(input) {
                let len = input.length;
                let res = "";
                for (let i = 0; i < len; ++i)
                    res += String.fromCharCode(input[i]);
                return res;
            }
            Util.uint8ArrayToString = uint8ArrayToString;
            function fromUTF8(binstr) {
                if (!binstr)
                    return "";
                // escape function is deprecated
                let escaped = "";
                for (let i = 0; i < binstr.length; ++i) {
                    let k = binstr.charCodeAt(i) & 0xff;
                    if (k == 37 || k > 0x7f) {
                        escaped += "%" + k.toString(16);
                    }
                    else {
                        escaped += binstr.charAt(i);
                    }
                }
                // decodeURIComponent does the actual UTF8 decoding
                return decodeURIComponent(escaped);
            }
            Util.fromUTF8 = fromUTF8;
            function toUTF8(str, cesu8) {
                let res = "";
                if (!str)
                    return res;
                for (let i = 0; i < str.length; ++i) {
                    let code = str.charCodeAt(i);
                    if (code <= 0x7f)
                        res += str.charAt(i);
                    else if (code <= 0x7ff) {
                        res += String.fromCharCode(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
                    }
                    else {
                        if (!cesu8 && 0xd800 <= code && code <= 0xdbff) {
                            let next = str.charCodeAt(++i);
                            if (!isNaN(next))
                                code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                        }
                        if (code <= 0xffff)
                            res += String.fromCharCode(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                        else
                            res += String.fromCharCode(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                    }
                }
                return res;
            }
            Util.toUTF8 = toUTF8;
            function toHex(bytes) {
                let r = "";
                for (let i = 0; i < bytes.length; ++i)
                    r += ("0" + bytes[i].toString(16)).slice(-2);
                return r;
            }
            Util.toHex = toHex;
            function fromHex(hex) {
                let r = new Uint8Array(hex.length >> 1);
                for (let i = 0; i < hex.length; i += 2)
                    r[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
                return r;
            }
            Util.fromHex = fromHex;
            class PromiseQueue {
                constructor() {
                    this.promises = {};
                }
                enqueue(id, f) {
                    return new Promise((resolve, reject) => {
                        let arr = this.promises[id];
                        if (!arr) {
                            arr = this.promises[id] = [];
                        }
                        arr.push(() => f()
                            .finally(() => {
                            arr.shift();
                            if (arr.length == 0)
                                delete this.promises[id];
                            else
                                arr[0]();
                        })
                            .then(resolve, reject));
                        if (arr.length == 1)
                            arr[0]();
                    });
                }
            }
            Util.PromiseQueue = PromiseQueue;
            class PromiseBuffer {
                constructor() {
                    this.waiting = [];
                    this.available = [];
                }
                drain() {
                    for (let f of this.waiting) {
                        f(new Error("Promise Buffer Reset"));
                    }
                    this.waiting = [];
                    this.available = [];
                }
                pushError(v) {
                    this.push(v);
                }
                push(v) {
                    let f = this.waiting.shift();
                    if (f)
                        f(v);
                    else
                        this.available.push(v);
                }
                shiftAsync(timeout = 0) {
                    if (this.available.length > 0) {
                        let v = this.available.shift();
                        if (v instanceof Error)
                            return Promise.reject(v);
                        else
                            return Promise.resolve(v);
                    }
                    else
                        return new Promise((resolve, reject) => {
                            let f = (v) => {
                                if (v instanceof Error)
                                    reject(v);
                                else
                                    resolve(v);
                            };
                            this.waiting.push(f);
                            if (timeout > 0) {
                                pxtc.U.delay(timeout)
                                    .then(() => {
                                    let idx = this.waiting.indexOf(f);
                                    if (idx >= 0) {
                                        this.waiting.splice(idx, 1);
                                        reject(new Error("Timeout"));
                                    }
                                });
                            }
                        });
                }
            }
            Util.PromiseBuffer = PromiseBuffer;
            function now() {
                return Date.now();
            }
            Util.now = now;
            function nowSeconds() {
                return Math.round(now() / 1000);
            }
            Util.nowSeconds = nowSeconds;
            function timeout(ms) {
                return new Promise(resolve => setTimeout(() => resolve(), ms));
            }
            Util.timeout = timeout;
            // node.js overrides this to use process.cpuUsage()
            Util.cpuUs = () => {
                // current time in microseconds
                const perf = typeof performance != "undefined" ?
                    performance.now.bind(performance) ||
                        performance.moznow.bind(performance) ||
                        performance.msNow.bind(performance) ||
                        performance.webkitNow.bind(performance) ||
                        performance.oNow.bind(performance) :
                    Date.now;
                Util.cpuUs = () => perf() * 1000;
                return Util.cpuUs();
            };
            function getMime(filename) {
                let m = /\.([a-zA-Z0-9]+)$/.exec(filename);
                if (m)
                    switch (m[1].toLowerCase()) {
                        case "txt": return "text/plain";
                        case "html":
                        case "htm": return "text/html";
                        case "css": return "text/css";
                        case "js": return "application/javascript";
                        case "jpg":
                        case "jpeg": return "image/jpeg";
                        case "png": return "image/png";
                        case "ico": return "image/x-icon";
                        case "manifest": return "text/cache-manifest";
                        case "webmanifest": return "application/manifest+json";
                        case "json": return "application/json";
                        case "svg": return "image/svg+xml";
                        case "eot": return "application/vnd.ms-fontobject";
                        case "ttf": return "font/ttf";
                        case "woff": return "application/font-woff";
                        case "woff2": return "application/font-woff2";
                        case "md": return "text/markdown";
                        case "xml": return "application/xml";
                        case "m4a": return "audio/m4a";
                        case "mp3": return "audio/mp3";
                        default: return "application/octet-stream";
                    }
                else
                    return "application/octet-stream";
            }
            Util.getMime = getMime;
            function randomUint32() {
                let buf = new Uint8Array(4);
                Util.getRandomBuf(buf);
                return new Uint32Array(buf.buffer)[0];
            }
            Util.randomUint32 = randomUint32;
            function guidGen() {
                function f() { return (randomUint32() | 0x10000).toString(16).slice(-4); }
                return f() + f() + "-" + f() + "-4" + f().slice(-3) + "-" + f() + "-" + f() + f() + f();
            }
            Util.guidGen = guidGen;
            function downloadLiveTranslationsAsync(lang, filename, branch, etag) {
                // hitting the cloud
                function downloadFromCloudAsync(strings) {
                    pxt.debug(`downloading translations for ${lang} ${filename} ${branch || ""}`);
                    let host = pxt.BrowserUtils.isLocalHost() || pxt.webConfig.isStatic ? "https://makecode.com/api/" : "";
                    // https://pxt.io/api/translations?filename=strings.json&lang=pl&approved=true&branch=v0
                    let url = `${host}translations?lang=${encodeURIComponent(lang)}&filename=${encodeURIComponent(filename)}&approved=true`;
                    if (branch)
                        url += '&branch=' + encodeURIComponent(branch);
                    const headers = {};
                    if (etag && !pxt.Cloud.useCdnApi())
                        headers["If-None-Match"] = etag;
                    return (host ? requestAsync : pxt.Cloud.apiRequestWithCdnAsync)({ url, headers }).then(resp => {
                        // if 304, translation not changed, skip
                        if (resp.statusCode == 304 || resp.statusCode == 200) {
                            // store etag and translations
                            etag = resp.headers["etag"] || "";
                            return pxt.BrowserUtils.translationDbAsync()
                                .then(db => db.setAsync(lang, filename, branch, etag, resp.json || strings))
                                .then(() => resp.json || strings);
                        }
                        return resp.json;
                    }, e => {
                        console.log(`failed to load translations from ${url}`);
                        return undefined;
                    });
                }
                // check for cache
                return pxt.BrowserUtils.translationDbAsync()
                    .then(db => db.getAsync(lang, filename, branch))
                    .then((entry) => {
                    // if cached, return immediately
                    if (entry) {
                        etag = entry.etag;
                        // update expired entries
                        const dt = (Date.now() - entry.time) / 1000;
                        if (dt > 300) // 5min caching time before trying etag again
                            downloadFromCloudAsync(entry.strings);
                        return entry.strings;
                    }
                    else
                        return downloadFromCloudAsync();
                });
            }
            Util.downloadLiveTranslationsAsync = downloadLiveTranslationsAsync;
            Util.pxtLangCookieId = "PXT_LANG";
            Util.langCookieExpirationDays = 30;
            // "lang-code": { englishName: "", localizedName: ""},
            // Crowdin code: https://support.crowdin.com/api/language-codes/
            // English name and localized name: https://en.wikipedia.org/wiki/List_of_language_names
            Util.allLanguages = {
                "af": { englishName: "Afrikaans", localizedName: "Afrikaans" },
                "ar": { englishName: "Arabic", localizedName: "العربية" },
                "az": { englishName: "Azerbaijani", localizedName: "آذربایجان دیلی" },
                "bg": { englishName: "Bulgarian", localizedName: "български" },
                "bn": { englishName: "Bengali", localizedName: "বাংলা" },
                "ca": { englishName: "Catalan", localizedName: "Català" },
                "cs": { englishName: "Czech", localizedName: "Čeština" },
                "da": { englishName: "Danish", localizedName: "Dansk" },
                "de": { englishName: "German", localizedName: "Deutsch" },
                "el": { englishName: "Greek", localizedName: "Ελληνικά" },
                "en": { englishName: "English", localizedName: "English" },
                "es-ES": { englishName: "Spanish (Spain)", localizedName: "Español (España)" },
                "es-MX": { englishName: "Spanish (Mexico)", localizedName: "Español (México)" },
                "et": { englishName: "Estonian", localizedName: "Eesti" },
                "eu": { englishName: "Basque", localizedName: "Euskara" },
                "fa": { englishName: "Persian", localizedName: "فارسی" },
                "fi": { englishName: "Finnish", localizedName: "Suomi" },
                "fr": { englishName: "French", localizedName: "Français" },
                "fr-CA": { englishName: "French (Canada)", localizedName: "Français (Canada)" },
                "gu-IN": { englishName: "Gujarati", localizedName: "ગુજરાતી" },
                "he": { englishName: "Hebrew", localizedName: "עברית" },
                "hr": { englishName: "Croatian", localizedName: "Hrvatski" },
                "hu": { englishName: "Hungarian", localizedName: "Magyar" },
                "hy-AM": { englishName: "Armenian (Armenia)", localizedName: "Հայերէն (Հայաստան)" },
                "id": { englishName: "Indonesian", localizedName: "Bahasa Indonesia" },
                "is": { englishName: "Icelandic", localizedName: "Íslenska" },
                "it": { englishName: "Italian", localizedName: "Italiano" },
                "ja": { englishName: "Japanese", localizedName: "日本語" },
                "kab": { englishName: "Kabyle", localizedName: "شئعم" },
                "ko": { englishName: "Korean", localizedName: "한국어" },
                "kmr": { englishName: "Kurmanji (Kurdish)", localizedName: "کورمانجی‎" },
                "kn": { englishName: "Kannada", localizedName: "ಕನ್ನಡ" },
                "lt": { englishName: "Lithuanian", localizedName: "Lietuvių" },
                "lv": { englishName: "Latvian", localizedName: "Latviešu" },
                "ml-IN": { englishName: "Malayalam", localizedName: "മലയാളം" },
                "mr": { englishName: "Marathi", localizedName: "मराठी" },
                "nl": { englishName: "Dutch", localizedName: "Nederlands" },
                "no": { englishName: "Norwegian", localizedName: "Norsk" },
                "nb": { englishName: "Norwegian Bokmal", localizedName: "Norsk bokmål" },
                "nn-NO": { englishName: "Norwegian Nynorsk", localizedName: "Norsk nynorsk" },
                "pa-IN": { englishName: "Punjabi", localizedName: "ਪੰਜਾਬੀ" },
                "pl": { englishName: "Polish", localizedName: "Polski" },
                "pt-BR": { englishName: "Portuguese (Brazil)", localizedName: "Português (Brasil)" },
                "pt-PT": { englishName: "Portuguese (Portugal)", localizedName: "Português (Portugal)" },
                "ro": { englishName: "Romanian", localizedName: "Română" },
                "ru": { englishName: "Russian", localizedName: "Русский" },
                "si-LK": { englishName: "Sinhala (Sri Lanka)", localizedName: "සිංහල (ශ්රී ලංකා)" },
                "sk": { englishName: "Slovak", localizedName: "Slovenčina" },
                "sl": { englishName: "Slovenian", localizedName: "Slovenski" },
                "sr": { englishName: "Serbian", localizedName: "Srpski" },
                "su": { englishName: "Sundanese", localizedName: "ᮘᮞ ᮞᮥᮔ᮪ᮓ" },
                "sv-SE": { englishName: "Swedish (Sweden)", localizedName: "Svenska (Sverige)" },
                "ta": { englishName: "Tamil", localizedName: "தமிழ்" },
                "te": { englishName: "Telugu", localizedName: "తెలుగు" },
                "th": { englishName: "Thai", localizedName: "ภาษาไทย" },
                "tl": { englishName: "Tagalog", localizedName: "ᜏᜒᜃᜅ᜔ ᜆᜄᜎᜓᜄ᜔" },
                "tr": { englishName: "Turkish", localizedName: "Türkçe" },
                "uk": { englishName: "Ukrainian", localizedName: "Українська" },
                "ur-IN": { englishName: "Urdu (India)", localizedName: "اردو (ہندوستان)" },
                "ur-PK": { englishName: "Urdu (Pakistan)", localizedName: "اردو (پاکستان)" },
                "vi": { englishName: "Vietnamese", localizedName: "Tiếng việt" },
                "zh-CN": { englishName: "Chinese (Simplified)", localizedName: "简体中文" },
                "zh-TW": { englishName: "Chinese (Traditional)", localizedName: "繁体中文" },
            };
            function isLocaleEnabled(code) {
                let [lang, baseLang] = Util.normalizeLanguageCode(code);
                let appTheme = pxt.appTarget.appTheme;
                if (appTheme && appTheme.availableLocales) {
                    if (appTheme.availableLocales.indexOf(lang) > -1) {
                        return true;
                    }
                    //check for base language if we didn't find the full language. Example: nl for nl-NL
                    if (baseLang && appTheme.availableLocales.indexOf(baseLang) > -1) {
                        return true;
                    }
                }
                return false;
            }
            Util.isLocaleEnabled = isLocaleEnabled;
            function updateLocalizationAsync(opts) {
                const { targetId, baseUrl, pxtBranch, targetBranch, force, } = opts;
                let { code } = opts;
                code = Util.normalizeLanguageCode(code)[0];
                if (code === "en-US")
                    code = "en"; // special case for built-in language
                if (code === Util.userLanguage() || (!isLocaleEnabled(code) && !force)) {
                    pxt.debug(`loc: ${code} (using built-in)`);
                    return Promise.resolve();
                }
                pxt.debug(`loc: ${code}`);
                const liveUpdateStrings = pxt.Util.liveLocalizationEnabled();
                return downloadTranslationsAsync(targetId, baseUrl, code, pxtBranch, targetBranch, liveUpdateStrings, ts.pxtc.Util.TranslationsKind.Editor)
                    .then((translations) => {
                    if (translations) {
                        Util.setUserLanguage(code);
                        Util.setLocalizedStrings(translations);
                    }
                    // Download api translations
                    return ts.pxtc.Util.downloadTranslationsAsync(targetId, baseUrl, code, pxtBranch, targetBranch, liveUpdateStrings, ts.pxtc.Util.TranslationsKind.Apis)
                        .then(trs => {
                        if (trs)
                            ts.pxtc.apiLocalizationStrings = trs;
                    });
                });
            }
            Util.updateLocalizationAsync = updateLocalizationAsync;
            let TranslationsKind;
            (function (TranslationsKind) {
                TranslationsKind[TranslationsKind["Editor"] = 0] = "Editor";
                TranslationsKind[TranslationsKind["Sim"] = 1] = "Sim";
                TranslationsKind[TranslationsKind["Apis"] = 2] = "Apis";
                TranslationsKind[TranslationsKind["SkillMap"] = 3] = "SkillMap";
            })(TranslationsKind = Util.TranslationsKind || (Util.TranslationsKind = {}));
            function downloadTranslationsAsync(targetId, baseUrl, code, pxtBranch, targetBranch, live, translationKind) {
                translationKind = translationKind || TranslationsKind.Editor;
                code = Util.normalizeLanguageCode(code)[0];
                if (code === "en-US" || code === "en") // shortcut
                    return Promise.resolve(undefined);
                let translationsCacheId = `${code}/${live}/${translationKind}`;
                if (Util.translationsCache()[translationsCacheId]) {
                    return Promise.resolve(Util.translationsCache()[translationsCacheId]);
                }
                let stringFiles;
                switch (translationKind) {
                    case TranslationsKind.Editor:
                        stringFiles = [
                            { branch: pxtBranch, staticName: "strings.json", path: "strings.json" },
                            { branch: targetBranch, staticName: "target-strings.json", path: targetId + "/target-strings.json" },
                        ];
                        break;
                    case TranslationsKind.Sim:
                        stringFiles = [{ branch: targetBranch, staticName: "sim-strings.json", path: targetId + "/sim-strings.json" }];
                        break;
                    case TranslationsKind.Apis:
                        stringFiles = [{ branch: targetBranch, staticName: "bundled-strings.json", path: targetId + "/bundled-strings.json" }];
                        break;
                    case TranslationsKind.SkillMap:
                        stringFiles = [{ branch: targetBranch, staticName: "skillmap-strings.json", path: "/skillmap-strings.json" }];
                        break;
                }
                let translations;
                function mergeTranslations(tr) {
                    if (!tr)
                        return;
                    if (!translations) {
                        translations = {};
                    }
                    Object.keys(tr)
                        .filter(k => !!tr[k])
                        .forEach(k => translations[k] = tr[k]);
                }
                if (live) {
                    let errorCount = 0;
                    const pAll = pxtc.U.promiseMapAllSeries(stringFiles, (file) => downloadLiveTranslationsAsync(code, file.path, file.branch)
                        .then(mergeTranslations, e => {
                        console.log(e.message);
                        ++errorCount;
                    }));
                    return pAll.then(() => {
                        // Cache translations unless there was an error for one of the files
                        if (errorCount) {
                            Util.translationsCache()[translationsCacheId] = translations;
                        }
                        if (errorCount === stringFiles.length || !translations) {
                            // Retry with non-live translations by setting live to false
                            pxt.tickEvent("translations.livetranslationsfailed");
                            return downloadTranslationsAsync(targetId, baseUrl, code, pxtBranch, targetBranch, false, translationKind);
                        }
                        return Promise.resolve(translations);
                    });
                }
                else {
                    return Promise.all(stringFiles.map(p => Util.httpGetJsonAsync(`${baseUrl}locales/${code}/${p.staticName}`)
                        .catch(e => undefined))).then(resps => {
                        let tr = {};
                        resps.forEach(res => pxt.Util.jsonMergeFrom(tr, res));
                        if (Object.keys(tr).length) {
                            translations = tr;
                            Util.translationsCache()[translationsCacheId] = translations;
                        }
                    }, e => {
                        console.error('failed to load localizations');
                    })
                        .then(() => translations);
                }
            }
            Util.downloadTranslationsAsync = downloadTranslationsAsync;
            function capitalize(n) {
                return n ? (n[0].toLocaleUpperCase() + n.slice(1)) : n;
            }
            Util.capitalize = capitalize;
            function uncapitalize(n) {
                return (n || "").split(/(?=[A-Z])/g).join(" ").toLowerCase();
            }
            Util.uncapitalize = uncapitalize;
            function range(len) {
                let r = [];
                for (let i = 0; i < len; ++i)
                    r.push(i);
                return r;
            }
            Util.range = range;
            function multipartPostAsync(uri, data = {}, filename = null, filecontents = null) {
                const boundary = "--------------------------0461489f461126c5";
                let form = "";
                function add(name, val) {
                    form += boundary + "\r\n";
                    form += "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n";
                    form += val + "\r\n";
                }
                function addF(name, val) {
                    const fn = name.split('/').reverse()[0];
                    form += boundary + "\r\n";
                    form += "Content-Disposition: form-data; name=\"files[" + name + "]\"; filename=\"" + fn + "\"\r\n";
                    form += "\r\n";
                    form += val + "\r\n";
                }
                Object.keys(data).forEach(k => add(k, data[k]));
                if (filename)
                    addF(filename, filecontents);
                form += boundary + "--\r\n";
                const req = {
                    url: uri,
                    method: "POST",
                    headers: {
                        "Content-Type": "multipart/form-data; boundary=" + boundary.slice(2)
                    },
                    data: form
                };
                return Util.httpRequestCoreAsync(req);
            }
            Util.multipartPostAsync = multipartPostAsync;
            function toDataUri(data, mimetype) {
                // TODO does this only support trusted data?
                // weed out urls
                if (/^https?:/i.test(data))
                    return data;
                // already a data uri?
                if (/^data:/i.test(data))
                    return data;
                // infer mimetype
                if (!mimetype) {
                    if (/^<svg/i.test(data))
                        mimetype = "image/svg+xml";
                }
                // encode
                if (/xml|svg/.test(mimetype))
                    return `data:${mimetype},${encodeURIComponent(data)}`;
                else
                    return `data:${mimetype || "image/png"};base64,${pxtc.encodeBase64(toUTF8(data))}`;
            }
            Util.toDataUri = toDataUri;
            Util.imageMagic = 0x59347a7d; // randomly selected
            Util.imageHeaderSize = 36; // has to be divisible by 9
            function encodeBlobAsync(canvas, blob) {
                const neededBytes = Util.imageHeaderSize + blob.length;
                const usableBytes = (canvas.width * canvas.height - 1) * 3;
                let bpp = 1;
                while (bpp < 4) {
                    if (usableBytes * bpp >= neededBytes * 8)
                        break;
                    bpp++;
                }
                let imgCapacity = (usableBytes * bpp) >> 3;
                let missing = neededBytes - imgCapacity;
                let addedLines = 0;
                let addedOffset = canvas.width * canvas.height * 4;
                if (missing > 0) {
                    const bytesPerLine = canvas.width * 3;
                    addedLines = Math.ceil(missing / bytesPerLine);
                    const c2 = document.createElement("canvas");
                    c2.width = canvas.width;
                    c2.height = canvas.height + addedLines;
                    const ctx = c2.getContext("2d");
                    ctx.drawImage(canvas, 0, 0);
                    canvas = c2;
                }
                let header = pxt.HF2.encodeU32LE([
                    Util.imageMagic,
                    blob.length,
                    addedLines,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                ]);
                pxt.Util.assert(header.length == Util.imageHeaderSize);
                function encode(img, ptr, bpp, data) {
                    let shift = 0;
                    let dp = 0;
                    let v = data[dp++];
                    const bppMask = (1 << bpp) - 1;
                    let keepGoing = true;
                    while (keepGoing) {
                        let bits = (v >> shift) & bppMask;
                        let left = 8 - shift;
                        if (left <= bpp) {
                            if (dp >= data.length) {
                                if (left == 0)
                                    break;
                                else
                                    keepGoing = false;
                            }
                            v = data[dp++];
                            bits |= (v << left) & bppMask;
                            shift = bpp - left;
                        }
                        else {
                            shift += bpp;
                        }
                        img[ptr] = ((img[ptr] & ~bppMask) | bits) & 0xff;
                        ptr++;
                        if ((ptr & 3) == 3) {
                            // set alpha to 0xff
                            img[ptr++] = 0xff;
                        }
                    }
                    return ptr;
                }
                const ctx = canvas.getContext("2d");
                const imgdat = ctx.getImageData(0, 0, canvas.width, canvas.height);
                // first pixel holds bpp (LSB are written first, so we can skip what it writes in second and third pixel)
                encode(imgdat.data, 0, 1, [bpp]);
                let ptr = 4;
                // next, the header
                ptr = encode(imgdat.data, ptr, bpp, header);
                pxt.Util.assert((ptr & 3) == 0);
                if (addedLines == 0)
                    ptr = encode(imgdat.data, ptr, bpp, blob);
                else {
                    let firstChunk = imgCapacity - header.length;
                    ptr = encode(imgdat.data, ptr, bpp, blob.slice(0, firstChunk));
                    ptr = encode(imgdat.data, addedOffset, 8, blob.slice(firstChunk));
                }
                // set remaining alpha
                ptr |= 3;
                while (ptr < imgdat.data.length) {
                    imgdat.data[ptr] = 0xff;
                    ptr += 4;
                }
                ctx.putImageData(imgdat, 0, 0);
                return canvas;
            }
            Util.encodeBlobAsync = encodeBlobAsync;
            function decodeBlobAsync(dataURL) {
                return pxt.BrowserUtils.loadCanvasAsync(dataURL)
                    .then(canvas => {
                    const ctx = canvas.getContext("2d");
                    const imgdat = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const d = imgdat.data;
                    const bpp = (d[0] & 1) | ((d[1] & 1) << 1) | ((d[2] & 1) << 2);
                    // Safari sometimes just reads a buffer full of 0's so we also need to bail if bpp == 0
                    if (bpp > 5 || bpp == 0)
                        return Promise.reject(new Error(Util.lf("Invalid encoded PNG format")));
                    function decode(ptr, bpp, trg) {
                        let shift = 0;
                        let i = 0;
                        let acc = 0;
                        const mask = (1 << bpp) - 1;
                        while (i < trg.length) {
                            acc |= (d[ptr++] & mask) << shift;
                            if ((ptr & 3) == 3)
                                ptr++; // skip alpha
                            shift += bpp;
                            if (shift >= 8) {
                                trg[i++] = acc & 0xff;
                                acc >>= 8;
                                shift -= 8;
                            }
                        }
                        return ptr;
                    }
                    const hd = new Uint8Array(pxt.Util.imageHeaderSize);
                    let ptr = decode(4, bpp, hd);
                    const dhd = pxt.HF2.decodeU32LE(hd);
                    if (dhd[0] != pxt.Util.imageMagic)
                        return Promise.reject(new Error(Util.lf("Invalid magic in encoded PNG")));
                    const res = new Uint8Array(dhd[1]);
                    const addedLines = dhd[2];
                    if (addedLines > 0) {
                        const origSize = (canvas.height - addedLines) * canvas.width;
                        const imgCap = (origSize - 1) * 3 * bpp >> 3;
                        const tmp = new Uint8Array(imgCap - pxt.Util.imageHeaderSize);
                        decode(ptr, bpp, tmp);
                        res.set(tmp);
                        const added = new Uint8Array(res.length - tmp.length);
                        decode(origSize * 4, 8, added);
                        res.set(added, tmp.length);
                    }
                    else {
                        decode(ptr, bpp, res);
                    }
                    return res;
                });
            }
            Util.decodeBlobAsync = decodeBlobAsync;
            function parseQueryString(qs) {
                let r = {};
                qs.replace(/\+/g, " ").replace(/([^#?&=]+)=([^#?&=]*)/g, (f, k, v) => {
                    r[decodeURIComponent(k)] = decodeURIComponent(v);
                    return "";
                });
                return r;
            }
            Util.parseQueryString = parseQueryString;
            function stringifyQueryString(url, qs) {
                for (let k of Object.keys(qs)) {
                    if (url.indexOf("?") >= 0) {
                        url += "&";
                    }
                    else {
                        url += "?";
                    }
                    url += encodeURIComponent(k) + "=" + encodeURIComponent(qs[k]);
                }
                return url;
            }
            Util.stringifyQueryString = stringifyQueryString;
        })(Util = pxtc.Util || (pxtc.Util = {}));
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
(function (ts) {
    var pxtc;
    (function (pxtc) {
        var BrowserImpl;
        (function (BrowserImpl) {
            pxtc.Util.httpRequestCoreAsync = httpRequestCoreAsync;
            pxtc.Util.sha256 = sha256string;
            pxtc.Util.getRandomBuf = buf => {
                if (window.crypto)
                    window.crypto.getRandomValues(buf);
                else {
                    for (let i = 0; i < buf.length; ++i)
                        buf[i] = Math.floor(Math.random() * 255);
                }
            };
            function httpRequestCoreAsync(options) {
                return new Promise((resolve, reject) => {
                    let client;
                    let resolved = false;
                    let headers = pxtc.Util.clone(options.headers) || {};
                    client = new XMLHttpRequest();
                    if (options.responseArrayBuffer)
                        client.responseType = "arraybuffer";
                    if (options.withCredentials)
                        client.withCredentials = true;
                    client.onreadystatechange = () => {
                        if (resolved)
                            return; // Safari/iOS likes to call this thing more than once
                        if (client.readyState == 4) {
                            resolved = true;
                            let res = {
                                statusCode: client.status,
                                headers: {},
                                buffer: client.responseBody || client.response,
                                text: options.responseArrayBuffer ? undefined : client.responseText,
                            };
                            const allHeaders = client.getAllResponseHeaders();
                            allHeaders.split(/\r?\n/).forEach(l => {
                                let m = /^\s*([^:]+): (.*)/.exec(l);
                                if (m)
                                    res.headers[m[1].toLowerCase()] = m[2];
                            });
                            resolve(res);
                        }
                    };
                    let data = options.data;
                    let method = options.method || (data == null ? "GET" : "POST");
                    let buf;
                    if (data == null) {
                        buf = null;
                    }
                    else if (data instanceof Uint8Array) {
                        buf = data;
                    }
                    else if (typeof data == "object") {
                        buf = JSON.stringify(data);
                        headers["content-type"] = "application/json; charset=utf8";
                    }
                    else if (typeof data == "string") {
                        buf = data;
                    }
                    else {
                        pxtc.Util.oops("bad data");
                    }
                    client.open(method, options.url);
                    Object.keys(headers).forEach(k => {
                        client.setRequestHeader(k, headers[k]);
                    });
                    if (buf == null)
                        client.send();
                    else
                        client.send(buf);
                });
            }
            const sha256_k = new Uint32Array([
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ]);
            function rotr(v, b) {
                return (v >>> b) | (v << (32 - b));
            }
            function sha256round(hs, w) {
                pxtc.Util.assert(hs.length == 8);
                pxtc.Util.assert(w.length == 64);
                for (let i = 16; i < 64; ++i) {
                    let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                    let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
                }
                let a = hs[0];
                let b = hs[1];
                let c = hs[2];
                let d = hs[3];
                let e = hs[4];
                let f = hs[5];
                let g = hs[6];
                let h = hs[7];
                for (let i = 0; i < 64; ++i) {
                    let s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                    let ch = (e & f) ^ (~e & g);
                    let temp1 = (h + s1 + ch + sha256_k[i] + w[i]) | 0;
                    let s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                    let maj = (a & b) ^ (a & c) ^ (b & c);
                    let temp2 = (s0 + maj) | 0;
                    h = g;
                    g = f;
                    f = e;
                    e = (d + temp1) | 0;
                    d = c;
                    c = b;
                    b = a;
                    a = (temp1 + temp2) | 0;
                }
                hs[0] += a;
                hs[1] += b;
                hs[2] += c;
                hs[3] += d;
                hs[4] += e;
                hs[5] += f;
                hs[6] += g;
                hs[7] += h;
            }
            function sha256buffer(buf) {
                let h = new Uint32Array(8);
                h[0] = 0x6a09e667;
                h[1] = 0xbb67ae85;
                h[2] = 0x3c6ef372;
                h[3] = 0xa54ff53a;
                h[4] = 0x510e527f;
                h[5] = 0x9b05688c;
                h[6] = 0x1f83d9ab;
                h[7] = 0x5be0cd19;
                let work = new Uint32Array(64);
                let chunkLen = 16 * 4;
                function addBuf(buf) {
                    let end = buf.length - (chunkLen - 1);
                    for (let i = 0; i < end; i += chunkLen) {
                        for (let j = 0; j < 16; j++) {
                            let off = (j << 2) + i;
                            work[j] = (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
                        }
                        sha256round(h, work);
                    }
                }
                addBuf(buf);
                let padSize = 64 - (buf.length + 9) % 64;
                if (padSize == 64)
                    padSize = 0;
                let endPos = buf.length - (buf.length % chunkLen);
                let padBuf = new Uint8Array((buf.length - endPos) + 1 + padSize + 8);
                let dst = 0;
                while (endPos < buf.length)
                    padBuf[dst++] = buf[endPos++];
                padBuf[dst++] = 0x80;
                while (padSize-- > 0)
                    padBuf[dst++] = 0x00;
                let len = buf.length * 8;
                dst = padBuf.length;
                while (len > 0) {
                    padBuf[--dst] = len & 0xff;
                    len >>= 8;
                }
                addBuf(padBuf);
                let res = "";
                for (let i = 0; i < h.length; ++i)
                    res += ("000000000" + h[i].toString(16)).slice(-8);
                return res.toLowerCase();
            }
            BrowserImpl.sha256buffer = sha256buffer;
            function sha256string(s) {
                return sha256buffer(pxtc.Util.stringToUint8Array(pxtc.Util.toUTF8(s)));
            }
            BrowserImpl.sha256string = sha256string;
        })(BrowserImpl = pxtc.BrowserImpl || (pxtc.BrowserImpl = {}));
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
/// <reference path="../localtypings/pxtpackage.d.ts"/>
/// <reference path="../localtypings/pxtparts.d.ts"/>
/// <reference path="../localtypings/pxtarget.d.ts"/>
/// <reference path="../localtypings/projectheader.d.ts"/>
/// <reference path="util.ts"/>
/// <reference path="apptarget.ts"/>
/// <reference path="tickEvent.ts"/>
var pxt;
(function (pxt) {
    var perf;
    (function (perf) {
    })(perf = pxt.perf || (pxt.perf = {}));
})(pxt || (pxt = {}));
(function () {
    // Sometimes these aren't initialized, for example in tests. We only care about them
    // doing anything in the browser.
    if (!pxt.perf.report)
        pxt.perf.report = () => { };
    if (!pxt.perf.recordMilestone)
        pxt.perf.recordMilestone = () => { };
    if (!pxt.perf.measureStart)
        pxt.perf.measureStart = () => { };
    if (!pxt.perf.measureEnd)
        pxt.perf.measureEnd = () => { };
})();
(function (pxt) {
    pxt.U = pxtc.Util;
    pxt.Util = pxtc.Util;
    let savedAppTarget;
    let savedSwitches = {};
    function setAppTarget(trg) {
        pxt.appTarget = trg || {};
        patchAppTarget();
        savedAppTarget = pxt.U.clone(pxt.appTarget);
    }
    pxt.setAppTarget = setAppTarget;
    let apiInfo;
    function setBundledApiInfo(inf) {
        for (const pkgName of Object.keys(inf)) {
            const byQName = inf[pkgName].apis.byQName;
            for (const apiName of Object.keys(byQName)) {
                const sym = byQName[apiName];
                const lastDot = apiName.lastIndexOf(".");
                const pyQName = sym.pyQName;
                // re-create the object - this will hint the JIT that these are objects of the same type
                // and the same hidden class should be used
                const newsym = byQName[apiName] = {
                    kind: Math.abs(sym.kind || 7),
                    qName: apiName,
                    namespace: apiName.slice(0, lastDot < 0 ? 0 : lastDot),
                    name: apiName.slice(lastDot + 1),
                    pyQName: pyQName,
                    pyName: pyQName ? pyQName.slice(pyQName.lastIndexOf(".") + 1) : undefined,
                    fileName: "",
                    attributes: sym.attributes || {},
                    retType: sym.retType || "void",
                    parameters: sym.parameters ? sym.parameters.map(p => ({
                        name: p.name,
                        description: p.description || "",
                        type: p.type || "number",
                        initializer: p.initializer,
                        default: p.default,
                        options: p.options || {},
                        isEnum: !!p.isEnum,
                        handlerParameters: p.handlerParameters
                    })) : null,
                    extendsTypes: sym.extendsTypes,
                    snippet: sym.kind && sym.kind < 0 ? null : undefined,
                    isInstance: !!sym.isInstance,
                    isReadOnly: !!sym.isReadOnly,
                };
                const attr = newsym.attributes;
                if (!attr.paramDefl)
                    attr.paramDefl = {};
                if (!attr.callingConvention)
                    attr.callingConvention = 0;
                if (!attr.paramHelp)
                    attr.paramHelp = {};
                if (!attr.jsDoc)
                    attr.jsDoc = "";
                attr._name = newsym.name.replace(/@.*/, "");
            }
        }
        apiInfo = inf;
    }
    pxt.setBundledApiInfo = setBundledApiInfo;
    function getBundledApiInfo() {
        return apiInfo;
    }
    pxt.getBundledApiInfo = getBundledApiInfo;
    function savedAppTheme() {
        return savedAppTarget ? savedAppTarget.appTheme : undefined;
    }
    pxt.savedAppTheme = savedAppTheme;
    function setCompileSwitch(name, value) {
        if (/^csv-/.test(name)) {
            pxt.setAppTargetVariant(name.replace(/^csv-*/, ""));
        }
        else if (pxt.appTarget) {
            savedSwitches[name] = value;
            pxt.U.jsonCopyFrom(pxt.appTarget.compile.switches, savedSwitches);
            pxt.U.jsonCopyFrom(savedAppTarget.compile.switches, savedSwitches);
        }
    }
    pxt.setCompileSwitch = setCompileSwitch;
    function setCompileSwitches(names) {
        if (!names)
            return;
        for (let s of names.split(/[\s,;:]+/)) {
            if (!s)
                continue;
            if (s[0] == "-") {
                setCompileSwitch(s.slice(1), false);
            }
            else {
                setCompileSwitch(s, true);
            }
        }
    }
    pxt.setCompileSwitches = setCompileSwitches;
    let _bundledcoresvgs;
    function bundledSvg(id) {
        if (!id)
            return undefined;
        let res = _bundledcoresvgs && _bundledcoresvgs[id];
        if (res)
            return res; // cache hit
        // find all core packages images
        if (!pxt.appTarget.simulator || !pxt.appTarget.simulator.dynamicBoardDefinition)
            return undefined;
        if (!_bundledcoresvgs)
            _bundledcoresvgs = {};
        const files = pxt.appTarget.bundledpkgs[id];
        if (!files)
            return undefined;
        // builtin packages are guaranteed to parse out
        const pxtjson = JSON.parse(files["pxt.json"]);
        if (pxtjson.core && files["board.json"]) {
            const boardjson = JSON.parse(files["board.json"]);
            if (boardjson && boardjson.visual && boardjson.visual.image) {
                let boardimg = boardjson.visual.image;
                if (/^pkg:\/\//.test(boardimg))
                    boardimg = files[boardimg.slice(6)];
                // this call gets expensive when having large number of boards
                _bundledcoresvgs[id] = `data:image/svg+xml;base64,${ts.pxtc.encodeBase64(pxt.Util.toUTF8(boardimg))}`;
            }
        }
        return _bundledcoresvgs[id];
    }
    pxt.bundledSvg = bundledSvg;
    function patchAppTarget() {
        // patch-up the target
        let comp = pxt.appTarget.compile;
        if (!comp)
            comp = pxt.appTarget.compile = { isNative: false, hasHex: false, switches: {} };
        if (comp.hasHex) {
            if (!comp.nativeType)
                comp.nativeType = pxtc.NATIVE_TYPE_THUMB;
        }
        if (!comp.switches)
            comp.switches = {};
        pxt.U.jsonCopyFrom(comp.switches, savedSwitches);
        // JS ref counting currently not supported
        comp.jsRefCounting = false;
        if (!comp.useUF2 && !comp.useELF && comp.noSourceInFlash == undefined)
            comp.noSourceInFlash = true; // no point putting sources in hex to be flashed
        if (comp.utf8 === undefined)
            comp.utf8 = true;
        if (!pxt.appTarget.appTheme)
            pxt.appTarget.appTheme = {};
        if (!pxt.appTarget.appTheme.embedUrl)
            pxt.appTarget.appTheme.embedUrl = pxt.appTarget.appTheme.homeUrl;
        let cs = pxt.appTarget.compileService;
        if (cs) {
            if (cs.yottaTarget && !cs.yottaBinary)
                cs.yottaBinary = "pxt-microbit-app-combined.hex";
        }
        // patch logo locations
        const theme = pxt.appTarget.appTheme;
        if (theme) {
            Object.keys(theme)
                .filter(k => /(logo|hero)$/i.test(k) && /^@cdnUrl@/.test(theme[k]))
                .forEach(k => theme[k] = pxt.BrowserUtils.patchCdn(theme[k]));
        }
        // patching simulator images
        const sim = pxt.appTarget.simulator;
        if (sim
            && sim.boardDefinition
            && sim.boardDefinition.visual) {
            let boardDef = sim.boardDefinition.visual;
            if (boardDef.image) {
                boardDef.image = pxt.BrowserUtils.patchCdn(boardDef.image);
                if (boardDef.outlineImage)
                    boardDef.outlineImage = pxt.BrowserUtils.patchCdn(boardDef.outlineImage);
            }
        }
        // patch icons in bundled packages
        Object.keys(pxt.appTarget.bundledpkgs).forEach(pkgid => {
            const res = pxt.appTarget.bundledpkgs[pkgid];
            // path config before storing
            const config = JSON.parse(res[pxt.CONFIG_NAME]);
            if (config.icon)
                config.icon = pxt.BrowserUtils.patchCdn(config.icon);
            res[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(config);
        });
        // patch any pre-configured query url appTheme overrides
        if (typeof window !== 'undefined') {
            // Map<AppTarget>
            const queryVariants = {
                "lockededitor=1": {
                    appTheme: {
                        lockedEditor: true
                    }
                },
                "hidemenu=1": {
                    appTheme: {
                        hideMenuBar: true
                    }
                }
            };
            // import target specific flags
            if (pxt.appTarget.queryVariants)
                pxt.Util.jsonCopyFrom(queryVariants, pxt.appTarget.queryVariants);
            const href = window.location.href;
            Object.keys(queryVariants).forEach(queryRegex => {
                const regex = new RegExp(queryRegex, "i");
                const match = regex.exec(href);
                if (match) {
                    // Apply any appTheme overrides
                    let v = queryVariants[queryRegex];
                    if (v) {
                        pxt.U.jsonMergeFrom(pxt.appTarget, v);
                    }
                }
            });
        }
    }
    function reloadAppTargetVariant(temporary = false) {
        pxt.perf.measureStart("reloadAppTargetVariant");
        const curr = temporary ? "" : JSON.stringify(pxt.appTarget);
        pxt.appTarget = pxt.U.clone(savedAppTarget);
        if (pxt.appTargetVariant) {
            const v = pxt.appTarget.variants && pxt.appTarget.variants[pxt.appTargetVariant];
            if (v)
                pxt.U.jsonMergeFrom(pxt.appTarget, v);
            else
                pxt.U.userError(lf("Variant '{0}' not defined in pxtarget.json", pxt.appTargetVariant));
        }
        patchAppTarget();
        // check if apptarget changed
        if (!temporary && pxt.onAppTargetChanged && curr != JSON.stringify(pxt.appTarget))
            pxt.onAppTargetChanged();
        pxt.perf.measureEnd("reloadAppTargetVariant");
    }
    pxt.reloadAppTargetVariant = reloadAppTargetVariant;
    // this is set by compileServiceVariant in pxt.json
    function setAppTargetVariant(variant, opts = {}) {
        pxt.debug(`app variant: ${variant}`);
        if (!opts.force && (pxt.appTargetVariant === variant || (!pxt.appTargetVariant && !variant)))
            return;
        pxt.appTargetVariant = variant;
        reloadAppTargetVariant(opts.temporary);
    }
    pxt.setAppTargetVariant = setAppTargetVariant;
    // This causes the `hw` package to be replaced with `hw---variant` upon package load
    // the pxt.json of hw---variant would generally specify compileServiceVariant
    // This is controlled by ?hw=variant or by configuration created by dragging `config.bin`
    // into editor.
    function setHwVariant(variant, name) {
        variant = variant.replace(/.*---/, "");
        if (/^[\w\-]+$/.test(variant)) {
            pxt.hwVariant = variant;
            pxt.hwName = name || variant;
        }
        else {
            pxt.hwVariant = null;
            pxt.hwName = null;
        }
        pxt.debug(`hwVariant: ${pxt.hwVariant} (${pxt.hwName})`);
    }
    pxt.setHwVariant = setHwVariant;
    function hasHwVariants() {
        return !!pxt.appTarget.variants
            && Object.keys(pxt.appTarget.bundledpkgs).some(pkg => /^hw---/.test(pkg));
    }
    pxt.hasHwVariants = hasHwVariants;
    function getHwVariants() {
        if (!pxt.appTarget.variants)
            return [];
        let hws = Object.keys(pxt.appTarget.bundledpkgs).filter(pkg => /^hw---/.test(pkg));
        return hws
            .map(pkg => JSON.parse(pxt.appTarget.bundledpkgs[pkg][pxt.CONFIG_NAME]))
            .filter((cfg) => {
            if (pxt.appTarget.appTheme.experimentalHw)
                return true;
            return !cfg.experimentalHw;
        });
    }
    pxt.getHwVariants = getHwVariants;
    pxt.options = {};
    // general error reported
    pxt.debug = typeof console !== "undefined" && !!console.debug
        ? (msg) => {
            if (pxt.options.debug)
                console.debug(msg);
        } : () => { };
    pxt.log = typeof console !== "undefined" && !!console.log
        ? (msg) => {
            console.log(msg);
        } : () => { };
    pxt.reportException = function (e, d) {
        if (console) {
            console.error(e);
            if (d) {
                try {
                    // log it as object, so native object inspector can be used
                    console.log(d);
                    //pxt.log(JSON.stringify(d, null, 2))
                }
                catch (e) { }
            }
        }
    };
    pxt.reportError = function (cat, msg, data) {
        if (console) {
            console.error(`${cat}: ${msg}`);
            if (data) {
                try {
                    pxt.log(JSON.stringify(data, null, 2));
                }
                catch (e) { }
            }
        }
    };
    function localWebConfig() {
        let r = {
            relprefix: "/--",
            workerjs: "/worker.js",
            monacoworkerjs: "/monacoworker.js",
            gifworkerjs: "/gifjs/gif.worker.js",
            serviceworkerjs: "/serviceworker.js",
            typeScriptWorkerJs: "/tsworker.js",
            pxtVersion: "local",
            pxtRelId: "localRelId",
            pxtCdnUrl: "/cdn/",
            commitCdnUrl: "/cdn/",
            blobCdnUrl: "/blb/",
            cdnUrl: "/cdn/",
            targetUrl: "",
            targetVersion: "local",
            targetRelId: "",
            targetId: pxt.appTarget ? pxt.appTarget.id : "",
            simUrl: "/sim/simulator.html",
            simserviceworkerUrl: "/simulatorserviceworker.js",
            simworkerconfigUrl: "/sim/workerConfig.js",
            partsUrl: "/sim/siminstructions.html"
        };
        return r;
    }
    pxt.localWebConfig = localWebConfig;
    function getOnlineCdnUrl() {
        if (!pxt.webConfig)
            return null;
        let m = /^(https:\/\/[^\/]+)/.exec(pxt.webConfig.commitCdnUrl);
        if (m)
            return m[1];
        else
            return null;
    }
    pxt.getOnlineCdnUrl = getOnlineCdnUrl;
    function setupWebConfig(cfg) {
        if (cfg)
            pxt.webConfig = cfg;
        else if (!pxt.webConfig)
            pxt.webConfig = localWebConfig();
    }
    pxt.setupWebConfig = setupWebConfig;
    function getEmbeddedScript(id) {
        return pxt.U.lookup(pxt.appTarget.bundledpkgs || {}, id);
    }
    pxt.getEmbeddedScript = getEmbeddedScript;
    let _targetConfigPromise = undefined;
    function targetConfigAsync() {
        if (!_targetConfigPromise) // cached promise
            _targetConfigPromise = pxt.Cloud.downloadTargetConfigAsync()
                .then(js => { return js || {}; }, err => { return {}; });
        return _targetConfigPromise;
    }
    pxt.targetConfigAsync = targetConfigAsync;
    function packagesConfigAsync() {
        return targetConfigAsync().then(config => config ? config.packages : undefined);
    }
    pxt.packagesConfigAsync = packagesConfigAsync;
    pxt.CONFIG_NAME = "pxt.json";
    pxt.SIMSTATE_JSON = ".simstate.json";
    pxt.SERIAL_EDITOR_FILE = "serial.txt";
    pxt.README_FILE = "README.md";
    pxt.GITIGNORE_FILE = ".gitignore";
    pxt.ASSETS_FILE = "assets.json";
    pxt.CLOUD_ID = "pxt/";
    pxt.BLOCKS_PROJECT_NAME = "blocksprj";
    pxt.JAVASCRIPT_PROJECT_NAME = "tsprj";
    pxt.PYTHON_PROJECT_NAME = "pyprj";
    pxt.MAIN_BLOCKS = "main.blocks";
    pxt.MAIN_TS = "main.ts";
    pxt.MAIN_PY = "main.py";
    pxt.DEFAULT_GROUP_NAME = "other"; // used in flyout, for snippet groups
    pxt.TILEMAP_CODE = "tilemap.g.ts";
    pxt.TILEMAP_JRES = "tilemap.g.jres";
    pxt.IMAGES_CODE = "images.g.ts";
    pxt.IMAGES_JRES = "images.g.jres";
    pxt.TUTORIAL_CODE_START = "_onCodeStart.ts";
    pxt.TUTORIAL_CODE_STOP = "_onCodeStop.ts";
    pxt.TUTORIAL_INFO_FILE = "tutorial-info-cache.json";
    pxt.TUTORIAL_CUSTOM_TS = "tutorial.custom.ts";
    function outputName(trg = null) {
        if (!trg)
            trg = pxt.appTarget.compile;
        if (trg.nativeType == ts.pxtc.NATIVE_TYPE_VM)
            return trg.useESP ? ts.pxtc.BINARY_ESP : ts.pxtc.BINARY_PXT64;
        else if (trg.useUF2 && !trg.switches.rawELF)
            return ts.pxtc.BINARY_UF2;
        else if (trg.useELF)
            return ts.pxtc.BINARY_ELF;
        else
            return ts.pxtc.BINARY_HEX;
    }
    pxt.outputName = outputName;
    function isOutputText(trg = null) {
        return outputName(trg) == ts.pxtc.BINARY_HEX;
    }
    pxt.isOutputText = isOutputText;
})(pxt || (pxt = {}));
/// <reference path="main.ts"/>
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        const THIS_NAME = "this";
        // The JS Math functions supported in the blocks. The order of this array
        // determines the order of the dropdown in the math_js_op block
        blocks.MATH_FUNCTIONS = {
            unary: ["sqrt", "sin", "cos", "tan"],
            binary: ["atan2"],
            infix: ["idiv", "imul"]
        };
        // Like MATH_FUNCTIONS, but used only for rounding operations
        blocks.ROUNDING_FUNCTIONS = ["round", "ceil", "floor", "trunc"];
        // Information for blocks that compile to function calls but are defined by vanilla Blockly
        // and not dynamically by BlocklyLoader
        blocks.builtinFunctionInfo = {
            "Math.abs": { blockId: "math_op3", params: ["x"] },
            "Math.min": { blockId: "math_op2", params: ["x", "y"] },
            "Math.max": { blockId: "math_op2", params: ["x", "y"] }
        };
        function normalizeBlock(b, err = pxt.log) {
            if (!b)
                return b;
            // normalize and validate common errors
            // made while translating
            let nb = b.replace(/(?:^|[^\\])([%$])\s+/g, '$1');
            if (nb != b) {
                err(`block has extra spaces: ${b}`);
                b = nb;
            }
            // remove spaces around %foo = ==> %foo=
            b = nb;
            nb = b.replace(/([%$]\w+)\s*=\s*(\w+)/, '$1=$2');
            if (nb != b) {
                err(`block has space between %name and = : ${b}`);
                b = nb;
            }
            // remove spaces before after pipe
            nb = nb.replace(/\s*\|\s*/g, '|');
            return nb;
        }
        blocks.normalizeBlock = normalizeBlock;
        function compileInfo(fn) {
            const res = {
                parameters: [],
                actualNameToParam: {},
                definitionNameToParam: {},
                handlerArgs: []
            };
            const instance = (fn.kind == 1 /* Method */ || fn.kind == 2 /* Property */) && !fn.attributes.defaultInstance;
            const hasBlockDef = !!fn.attributes._def;
            const defParameters = hasBlockDef ? fn.attributes._def.parameters.slice(0) : undefined;
            const optionalStart = hasBlockDef ? defParameters.length : (fn.parameters ? fn.parameters.length : 0);
            const bInfo = blocks.builtinFunctionInfo[fn.qName];
            if (hasBlockDef && fn.attributes._expandedDef) {
                defParameters.push(...fn.attributes._expandedDef.parameters);
            }
            const refMap = {};
            const definitionsWithoutRefs = defParameters ? defParameters.filter(p => {
                if (p.ref) {
                    refMap[p.name] = p;
                    return false;
                }
                return true;
            }) : [];
            if (instance && hasBlockDef && defParameters.length) {
                const def = refMap[THIS_NAME] || defParameters[0];
                const defName = def.name;
                const isVar = !def.shadowBlockId || def.shadowBlockId === "variables_get";
                let defaultValue;
                if (isVar) {
                    defaultValue = def.varName || fn.attributes.paramDefl[defName] || fn.attributes.paramDefl["this"];
                }
                res.thisParameter = {
                    actualName: THIS_NAME,
                    definitionName: defName,
                    shadowBlockId: def.shadowBlockId,
                    type: fn.namespace,
                    defaultValue: defaultValue,
                    // Normally we pass ths actual parameter name, but the "this" parameter doesn't have one
                    fieldEditor: fieldEditor(defName, THIS_NAME),
                    fieldOptions: fieldOptions(defName, THIS_NAME),
                    shadowOptions: shadowOptions(defName, THIS_NAME),
                };
            }
            if (fn.parameters) {
                let defIndex = (instance && !refMap[THIS_NAME]) ? 1 : 0;
                fn.parameters.forEach((p, i) => {
                    let def;
                    if (refMap[p.name]) {
                        def = refMap[p.name];
                    }
                    else if (defIndex < definitionsWithoutRefs.length) {
                        def = definitionsWithoutRefs[defIndex];
                        ++defIndex;
                    }
                    if (def || !hasBlockDef) {
                        let range = undefined;
                        if (p.options && p.options["min"] && p.options["max"]) {
                            range = { min: p.options["min"].value, max: p.options["max"].value };
                        }
                        const defName = def ? def.name : (bInfo ? bInfo.params[defIndex++] : p.name);
                        const isVarOrArray = def && (def.shadowBlockId === "variables_get" || def.shadowBlockId == "lists_create_with");
                        res.parameters.push({
                            actualName: p.name,
                            type: p.type,
                            defaultValue: isVarOrArray ? (def.varName || p.default) : p.default,
                            definitionName: defName,
                            shadowBlockId: def && def.shadowBlockId,
                            isOptional: defParameters ? defParameters.indexOf(def) >= optionalStart : false,
                            fieldEditor: fieldEditor(defName, p.name),
                            fieldOptions: fieldOptions(defName, p.name),
                            shadowOptions: shadowOptions(defName, p.name),
                            range
                        });
                    }
                    if (p.handlerParameters) {
                        p.handlerParameters.forEach(arg => {
                            res.handlerArgs.push({
                                name: arg.name,
                                type: arg.type,
                                inBlockDef: defParameters ? defParameters.some(def => def.ref && def.name === arg.name) : false
                            });
                        });
                    }
                });
            }
            res.parameters.forEach(p => {
                res.actualNameToParam[p.actualName] = p;
                res.definitionNameToParam[p.definitionName] = p;
            });
            return res;
            function fieldEditor(defName, actualName) {
                return fn.attributes.paramFieldEditor &&
                    (fn.attributes.paramFieldEditor[defName] || fn.attributes.paramFieldEditor[actualName]);
            }
            function fieldOptions(defName, actualName) {
                return fn.attributes.paramFieldEditorOptions &&
                    (fn.attributes.paramFieldEditorOptions[defName] || fn.attributes.paramFieldEditorOptions[actualName]);
            }
            function shadowOptions(defName, actualName) {
                return fn.attributes.paramShadowOptions &&
                    (fn.attributes.paramShadowOptions[defName] || fn.attributes.paramShadowOptions[actualName]);
            }
        }
        blocks.compileInfo = compileInfo;
        function hasHandler(fn) {
            return fn.parameters && fn.parameters.some(p => {
                var _a, _b;
                return (p.type == "() => void" ||
                    p.type == "Action" ||
                    !!((_a = p.properties) === null || _a === void 0 ? void 0 : _a.length) ||
                    !!((_b = p.handlerParameters) === null || _b === void 0 ? void 0 : _b.length));
            });
        }
        blocks.hasHandler = hasHandler;
        /**
         * Returns which Blockly block type to use for an argument reporter based
         * on the specified TypeScript type.
         * @param varType The variable's TypeScript type
         * @return The Blockly block type of the reporter to be used
         */
        function reporterTypeForArgType(varType) {
            let reporterType = "argument_reporter_custom";
            if (varType === "boolean" || varType === "number" || varType === "string") {
                reporterType = `argument_reporter_${varType}`;
            }
            return reporterType;
        }
        blocks.reporterTypeForArgType = reporterTypeForArgType;
        function defaultIconForArgType(typeName = "") {
            switch (typeName) {
                case "number":
                    return "calculator";
                case "string":
                    return "text width";
                case "boolean":
                    return "random";
                case "Array":
                    return "list";
                default:
                    return "align justify";
            }
        }
        blocks.defaultIconForArgType = defaultIconForArgType;
        function parseFields(b) {
            // normalize and validate common errors
            // made while translating
            return b.split('|').map((n, ni) => {
                let m = /([^%]*)\s*%([a-zA-Z0-9_]+)/.exec(n);
                if (!m)
                    return { n, ni };
                let pre = m[1];
                if (pre)
                    pre = pre.trim();
                let p = m[2];
                return { n, ni, pre, p };
            });
        }
        blocks.parseFields = parseFields;
        let _blockDefinitions;
        function blockDefinitions() {
            if (!_blockDefinitions)
                cacheBlockDefinitions();
            return _blockDefinitions;
        }
        blocks.blockDefinitions = blockDefinitions;
        function getBlockDefinition(blockId) {
            if (!_blockDefinitions)
                cacheBlockDefinitions();
            return _blockDefinitions[blockId];
        }
        blocks.getBlockDefinition = getBlockDefinition;
        // Resources for built-in and extra blocks
        function cacheBlockDefinitions() {
            _blockDefinitions = {
                'device_while': {
                    name: pxt.Util.lf("a loop that repeats while the condition is true"),
                    tooltip: pxt.Util.lf("Run the same sequence of actions while the condition is met."),
                    url: '/blocks/loops/while',
                    category: 'loops',
                    block: {
                        message0: pxt.Util.lf("while %1"),
                        appendField: pxt.Util.lf("{id:while}do")
                    }
                },
                'pxt_controls_for': {
                    name: pxt.Util.lf("a loop that repeats the number of times you say"),
                    tooltip: pxt.Util.lf("Have the variable '{0}' take on the values from 0 to the end number, counting by 1, and do the specified blocks."),
                    url: 'blocks/loops/for',
                    category: 'loops',
                    block: {
                        message0: pxt.Util.lf("for %1 from 0 to %2"),
                        variable: pxt.Util.lf("{id:var}index"),
                        appendField: pxt.Util.lf("{id:for}do")
                    }
                },
                'controls_simple_for': {
                    name: pxt.Util.lf("a loop that repeats the number of times you say"),
                    tooltip: pxt.Util.lf("Have the variable '{0}' take on the values from 0 to the end number, counting by 1, and do the specified blocks."),
                    url: 'blocks/loops/for',
                    category: 'loops',
                    block: {
                        message0: pxt.Util.lf("for %1 from 0 to %2"),
                        variable: pxt.Util.lf("{id:var}index"),
                        appendField: pxt.Util.lf("{id:for}do")
                    }
                },
                'pxt_controls_for_of': {
                    name: pxt.Util.lf("a loop that repeats for each value in an array"),
                    tooltip: pxt.Util.lf("Have the variable '{0}' take the value of each item in the array one by one, and do the specified blocks."),
                    url: 'blocks/loops/for-of',
                    category: 'loops',
                    block: {
                        message0: pxt.Util.lf("for element %1 of %2"),
                        variable: pxt.Util.lf("{id:var}value"),
                        appendField: pxt.Util.lf("{id:for_of}do")
                    }
                },
                'controls_for_of': {
                    name: pxt.Util.lf("a loop that repeats for each value in an array"),
                    tooltip: pxt.Util.lf("Have the variable '{0}' take the value of each item in the array one by one, and do the specified blocks."),
                    url: 'blocks/loops/for-of',
                    category: 'loops',
                    block: {
                        message0: pxt.Util.lf("for element %1 of %2"),
                        variable: pxt.Util.lf("{id:var}value"),
                        appendField: pxt.Util.lf("{id:for_of}do")
                    }
                },
                'math_op2': {
                    name: pxt.Util.lf("minimum or maximum of 2 numbers"),
                    tooltip: {
                        "min": pxt.Util.lf("smaller value of 2 numbers"),
                        "max": pxt.Util.lf("larger value of 2 numbers")
                    },
                    url: '/blocks/math',
                    operators: {
                        'op': ["min", "max"]
                    },
                    category: 'math'
                },
                'math_op3': {
                    name: pxt.Util.lf("absolute number"),
                    tooltip: pxt.Util.lf("absolute value of a number"),
                    url: '/reference/math',
                    category: 'math',
                    block: {
                        message0: pxt.Util.lf("absolute of %1")
                    }
                },
                'math_number': {
                    name: pxt.Util.lf("{id:block}number"),
                    url: '/blocks/math/random',
                    category: 'math',
                    tooltip: (pxt.appTarget && pxt.appTarget.compile) ?
                        pxt.Util.lf("a decimal number") : pxt.Util.lf("an integer number")
                },
                'math_integer': {
                    name: pxt.Util.lf("{id:block}number"),
                    url: '/blocks/math/random',
                    category: 'math',
                    tooltip: pxt.Util.lf("an integer number")
                },
                'math_whole_number': {
                    name: pxt.Util.lf("{id:block}number"),
                    url: '/blocks/math/random',
                    category: 'math',
                    tooltip: pxt.Util.lf("a whole number")
                },
                'math_number_minmax': {
                    name: pxt.Util.lf("{id:block}number"),
                    url: '/blocks/math/random',
                    category: 'math'
                },
                'math_arithmetic': {
                    name: pxt.Util.lf("arithmetic operation"),
                    url: '/blocks/math',
                    tooltip: {
                        ADD: pxt.Util.lf("Return the sum of the two numbers."),
                        MINUS: pxt.Util.lf("Return the difference of the two numbers."),
                        MULTIPLY: pxt.Util.lf("Return the product of the two numbers."),
                        DIVIDE: pxt.Util.lf("Return the quotient of the two numbers."),
                        POWER: pxt.Util.lf("Return the first number raised to the power of the second number."),
                    },
                    operators: {
                        'OP': ["ADD", "MINUS", "MULTIPLY", "DIVIDE", "POWER"]
                    },
                    category: 'math',
                    block: {
                        MATH_ADDITION_SYMBOL: pxt.Util.lf("{id:op}+"),
                        MATH_SUBTRACTION_SYMBOL: pxt.Util.lf("{id:op}-"),
                        MATH_MULTIPLICATION_SYMBOL: pxt.Util.lf("{id:op}×"),
                        MATH_DIVISION_SYMBOL: pxt.Util.lf("{id:op}÷"),
                        MATH_POWER_SYMBOL: pxt.Util.lf("{id:op}**")
                    }
                },
                'math_modulo': {
                    name: pxt.Util.lf("division remainder"),
                    tooltip: pxt.Util.lf("Return the remainder from dividing the two numbers."),
                    url: '/blocks/math',
                    category: 'math',
                    block: {
                        MATH_MODULO_TITLE: pxt.Util.lf("remainder of %1 ÷ %2")
                    }
                },
                'math_js_op': {
                    name: pxt.Util.lf("math function"),
                    tooltip: {
                        "sqrt": pxt.Util.lf("Returns the square root of the argument"),
                        "sin": pxt.Util.lf("Returns the sine of the argument"),
                        "cos": pxt.Util.lf("Returns the cosine of the argument"),
                        "tan": pxt.Util.lf("Returns the tangent of the argument"),
                        "atan2": pxt.Util.lf("Returns the arctangent of the quotient of the two arguments"),
                        "idiv": pxt.Util.lf("Returns the integer portion of the division operation on the two arguments"),
                        "imul": pxt.Util.lf("Returns the integer portion of the multiplication operation on the two arguments")
                    },
                    url: '/blocks/math',
                    operators: {
                        'OP': ["sqrt", "sin", "cos", "tan", "atan2", "idiv", "imul"]
                    },
                    category: 'math',
                    block: {
                        "sqrt": pxt.Util.lf("{id:op}square root"),
                        "sin": pxt.Util.lf("{id:op}sin"),
                        "cos": pxt.Util.lf("{id:op}cos"),
                        "tan": pxt.Util.lf("{id:op}tan"),
                        "atan2": pxt.Util.lf("{id:op}atan2"),
                        "idiv": pxt.Util.lf("{id:op}integer ÷"),
                        "imul": pxt.Util.lf("{id:op}integer ×"),
                    }
                },
                "math_js_round": {
                    name: pxt.Util.lf("rounding functions"),
                    tooltip: {
                        "round": pxt.Util.lf("Increases the argument to the next higher whole number if its fractional part is more than one half"),
                        "ceil": pxt.Util.lf("Increases the argument to the next higher whole number"),
                        "floor": pxt.Util.lf("Decreases the argument to the next lower whole number"),
                        "trunc": pxt.Util.lf("Removes the fractional part of the argument")
                    },
                    url: '/blocks/math',
                    operators: {
                        "OP": ["round", "ceil", "floor", "trunc"]
                    },
                    category: 'math',
                    block: {
                        "round": pxt.Util.lf("{id:op}round"),
                        "ceil": pxt.Util.lf("{id:op}ceiling"),
                        "floor": pxt.Util.lf("{id:op}floor"),
                        "trunc": pxt.Util.lf("{id:op}truncate"),
                    }
                },
                'variables_change': {
                    name: pxt.Util.lf("update the value of a number variable"),
                    tooltip: pxt.Util.lf("Changes the value of the variable by this amount"),
                    url: '/blocks/variables/change',
                    category: 'variables',
                    block: {
                        message0: pxt.Util.lf("change %1 by %2")
                    }
                },
                'controls_repeat_ext': {
                    name: pxt.Util.lf("a loop that repeats and increments an index"),
                    tooltip: pxt.Util.lf("Do some statements several times."),
                    url: '/blocks/loops/repeat',
                    category: 'loops',
                    block: {
                        CONTROLS_REPEAT_TITLE: pxt.Util.lf("repeat %1 times"),
                        CONTROLS_REPEAT_INPUT_DO: pxt.Util.lf("{id:repeat}do")
                    }
                },
                'variables_get': {
                    name: pxt.Util.lf("get the value of a variable"),
                    tooltip: pxt.Util.lf("Returns the value of this variable."),
                    url: '/blocks/variables',
                    category: 'variables',
                    block: {
                        VARIABLES_GET_CREATE_SET: pxt.Util.lf("Create 'set %1'")
                    }
                },
                'variables_get_reporter': {
                    name: pxt.Util.lf("get the value of a variable"),
                    tooltip: pxt.Util.lf("Returns the value of this variable."),
                    url: '/blocks/variables',
                    category: 'variables',
                    block: {
                        VARIABLES_GET_CREATE_SET: pxt.Util.lf("Create 'set %1'")
                    }
                },
                'variables_set': {
                    name: pxt.Util.lf("assign the value of a variable"),
                    tooltip: pxt.Util.lf("Sets this variable to be equal to the input."),
                    url: '/blocks/variables/assign',
                    category: 'variables',
                    block: {
                        VARIABLES_SET: pxt.Util.lf("set %1 to %2")
                    }
                },
                'controls_if': {
                    name: pxt.Util.lf("a conditional statement"),
                    tooltip: {
                        CONTROLS_IF_TOOLTIP_1: pxt.Util.lf("If a value is true, then do some statements."),
                        CONTROLS_IF_TOOLTIP_2: pxt.Util.lf("If a value is true, then do the first block of statements. Otherwise, do the second block of statements."),
                        CONTROLS_IF_TOOLTIP_3: pxt.Util.lf("If the first value is true, then do the first block of statements. Otherwise, if the second value is true, do the second block of statements."),
                        CONTROLS_IF_TOOLTIP_4: pxt.Util.lf("If the first value is true, then do the first block of statements. Otherwise, if the second value is true, do the second block of statements. If none of the values are true, do the last block of statements.")
                    },
                    tooltipSearch: "CONTROLS_IF_TOOLTIP_2",
                    url: '/blocks/logic/if',
                    category: 'logic',
                    block: {
                        CONTROLS_IF_MSG_IF: pxt.Util.lf("{id:logic}if"),
                        CONTROLS_IF_MSG_THEN: pxt.Util.lf("{id:logic}then"),
                        CONTROLS_IF_MSG_ELSE: pxt.Util.lf("{id:logic}else"),
                        CONTROLS_IF_MSG_ELSEIF: pxt.Util.lf("{id:logic}else if")
                    }
                },
                'lists_create_with': {
                    name: pxt.Util.lf("create an array"),
                    tooltip: pxt.Util.lf("Creates a new array."),
                    url: '/reference/arrays/create',
                    category: 'arrays',
                    blockTextSearch: "LISTS_CREATE_WITH_INPUT_WITH",
                    block: {
                        LISTS_CREATE_EMPTY_TITLE: pxt.Util.lf("empty array"),
                        LISTS_CREATE_WITH_INPUT_WITH: pxt.Util.lf("array of"),
                        LISTS_CREATE_WITH_CONTAINER_TITLE_ADD: pxt.Util.lf("array"),
                        LISTS_CREATE_WITH_ITEM_TITLE: pxt.Util.lf("value")
                    }
                },
                'lists_length': {
                    name: pxt.Util.lf("array length"),
                    tooltip: pxt.Util.lf("Returns the number of items in an array."),
                    url: '/reference/arrays/length',
                    category: 'arrays',
                    block: {
                        LISTS_LENGTH_TITLE: pxt.Util.lf("length of array %1")
                    }
                },
                'lists_index_get': {
                    name: pxt.Util.lf("get a value in an array"),
                    tooltip: pxt.Util.lf("Returns the value at the given index in an array."),
                    url: '/reference/arrays/get',
                    category: 'arrays',
                    block: {
                        message0: pxt.Util.lf("%1 get value at %2")
                    }
                },
                'lists_index_set': {
                    name: pxt.Util.lf("set a value in an array"),
                    tooltip: pxt.Util.lf("Sets the value at the given index in an array"),
                    url: '/reference/arrays/set',
                    category: 'arrays',
                    block: {
                        message0: pxt.Util.lf("%1 set value at %2 to %3")
                    }
                },
                'logic_compare': {
                    name: pxt.Util.lf("comparing two numbers"),
                    tooltip: {
                        LOGIC_COMPARE_TOOLTIP_EQ: pxt.Util.lf("Return true if both inputs equal each other."),
                        LOGIC_COMPARE_TOOLTIP_NEQ: pxt.Util.lf("Return true if both inputs are not equal to each other."),
                        LOGIC_COMPARE_TOOLTIP_LT: pxt.Util.lf("Return true if the first input is smaller than the second input."),
                        LOGIC_COMPARE_TOOLTIP_LTE: pxt.Util.lf("Return true if the first input is smaller than or equal to the second input."),
                        LOGIC_COMPARE_TOOLTIP_GT: pxt.Util.lf("Return true if the first input is greater than the second input."),
                        LOGIC_COMPARE_TOOLTIP_GTE: pxt.Util.lf("Return true if the first input is greater than or equal to the second input.")
                    },
                    url: '/blocks/logic/boolean',
                    category: 'logic',
                    block: {
                        search: "= ≠ < ≤ > ≥" // Only used for search; this string is not surfaced in the block's text
                    }
                },
                'logic_operation': {
                    name: pxt.Util.lf("boolean operation"),
                    tooltip: {
                        LOGIC_OPERATION_TOOLTIP_AND: pxt.Util.lf("Return true if both inputs are true."),
                        LOGIC_OPERATION_TOOLTIP_OR: pxt.Util.lf("Return true if at least one of the inputs is true.")
                    },
                    url: '/blocks/logic/boolean',
                    category: 'logic',
                    block: {
                        LOGIC_OPERATION_AND: pxt.Util.lf("{id:op}and"),
                        LOGIC_OPERATION_OR: pxt.Util.lf("{id:op}or")
                    }
                },
                'logic_negate': {
                    name: pxt.Util.lf("logical negation"),
                    tooltip: pxt.Util.lf("Returns true if the input is false. Returns false if the input is true."),
                    url: '/blocks/logic/boolean',
                    category: 'logic',
                    block: {
                        LOGIC_NEGATE_TITLE: pxt.Util.lf("not %1")
                    }
                },
                'logic_boolean': {
                    name: pxt.Util.lf("a `true` or `false` value"),
                    tooltip: pxt.Util.lf("Returns either true or false."),
                    url: '/blocks/logic/boolean',
                    category: 'logic',
                    block: {
                        LOGIC_BOOLEAN_TRUE: pxt.Util.lf("{id:boolean}true"),
                        LOGIC_BOOLEAN_FALSE: pxt.Util.lf("{id:boolean}false")
                    }
                },
                'text': {
                    name: pxt.Util.lf("a piece of text"),
                    tooltip: pxt.Util.lf("A letter, word, or line of text."),
                    url: 'types/string',
                    category: 'text',
                    block: {
                        search: pxt.Util.lf("a piece of text") // Only used for search; this string is not surfaced in the block's text
                    }
                },
                'text_length': {
                    name: pxt.Util.lf("number of characters in the string"),
                    tooltip: pxt.Util.lf("Returns the number of letters (including spaces) in the provided text."),
                    url: 'reference/text/length',
                    category: 'text',
                    block: {
                        TEXT_LENGTH_TITLE: pxt.Util.lf("length of %1")
                    }
                },
                'text_join': {
                    name: pxt.Util.lf("join items to create text"),
                    tooltip: pxt.Util.lf("Create a piece of text by joining together any number of items."),
                    url: 'reference/text/join',
                    category: 'text',
                    block: {
                        TEXT_JOIN_TITLE_CREATEWITH: pxt.Util.lf("join")
                    }
                },
                'procedures_defnoreturn': {
                    name: pxt.Util.lf("define the function"),
                    tooltip: pxt.Util.lf("Create a function."),
                    url: 'types/function/define',
                    category: 'functions',
                    block: {
                        PROCEDURES_DEFNORETURN_TITLE: pxt.Util.lf("function"),
                        PROCEDURE_ALREADY_EXISTS: pxt.Util.lf("A function named '%1' already exists.")
                    }
                },
                'procedures_callnoreturn': {
                    name: pxt.Util.lf("call the function"),
                    tooltip: pxt.Util.lf("Call the user-defined function."),
                    url: 'types/function/call',
                    category: 'functions',
                    block: {
                        PROCEDURES_CALLNORETURN_TITLE: pxt.Util.lf("call function")
                    }
                },
                'function_return': {
                    name: pxt.Util.lf("return a value from within a function"),
                    tooltip: pxt.Util.lf("Return a value from within a user-defined function."),
                    url: 'types/function/return',
                    category: 'functions',
                    block: {
                        message_with_value: pxt.Util.lf("return %1"),
                        message_no_value: pxt.Util.lf("return")
                    }
                },
                'function_definition': {
                    name: pxt.Util.lf("define the function"),
                    tooltip: pxt.Util.lf("Create a function."),
                    url: 'types/function/define',
                    category: 'functions',
                    block: {
                        FUNCTIONS_EDIT_OPTION: pxt.Util.lf("Edit Function")
                    }
                },
                'function_call': {
                    name: pxt.Util.lf("call the function"),
                    tooltip: pxt.Util.lf("Call the user-defined function."),
                    url: 'types/function/call',
                    category: 'functions',
                    block: {
                        FUNCTIONS_CALL_TITLE: pxt.Util.lf("call"),
                        FUNCTIONS_GO_TO_DEFINITION_OPTION: pxt.Util.lf("Go to Definition")
                    }
                },
                'function_call_output': {
                    name: pxt.Util.lf("call the function with a return value"),
                    tooltip: pxt.Util.lf("Call the user-defined function with a return value."),
                    url: 'types/function/call',
                    category: 'functions',
                    block: {}
                }
            };
            _blockDefinitions[pxtc.ON_START_TYPE] = {
                name: pxt.Util.lf("on start event"),
                tooltip: pxt.Util.lf("Run code when the program starts"),
                url: '/blocks/on-start',
                category: "loops",
                block: {
                    message0: pxt.Util.lf("on start %1 %2")
                }
            };
            _blockDefinitions[pxtc.PAUSE_UNTIL_TYPE] = {
                name: pxt.Util.lf("pause until"),
                tooltip: pxt.Util.lf("Pause execution of code until the given boolean expression is true"),
                url: '/blocks/pause-until',
                category: "loops",
                block: {
                    message0: pxt.Util.lf("pause until %1")
                }
            };
            _blockDefinitions[pxtc.TS_BREAK_TYPE] = {
                name: pxt.Util.lf("break"),
                tooltip: pxt.Util.lf("Break out of the current loop or switch"),
                url: '/blocks/loops/break',
                category: 'loops',
                block: {
                    message0: pxt.Util.lf("break")
                }
            };
            _blockDefinitions[pxtc.TS_CONTINUE_TYPE] = {
                name: pxt.Util.lf("continue"),
                tooltip: pxt.Util.lf("Skip current iteration and continues with the next iteration in the loop"),
                url: '/blocks/loops/continue',
                category: 'loops',
                block: {
                    message0: pxt.Util.lf("continue")
                }
            };
            if (pxt.Util.isTranslationMode()) {
                const msg = Blockly.Msg;
                pxt.Util.values(_blockDefinitions).filter(b => b.block).forEach(b => {
                    const keys = Object.keys(b.block);
                    b.translationIds = pxt.Util.values(b.block);
                    keys.forEach(k => pxt.crowdin.inContextLoadAsync(b.block[k])
                        .then(r => {
                        b.block[k] = r;
                        // override builtin blockly namespace strings
                        if (/^[A-Z_]+$/.test(k))
                            msg[k] = r;
                    }));
                });
            }
        }
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var BrowserUtils;
    (function (BrowserUtils) {
        function isIFrame() {
            try {
                return window && window.self !== window.top;
            }
            catch (e) {
                return true;
            }
        }
        BrowserUtils.isIFrame = isIFrame;
        function hasNavigator() {
            return typeof navigator !== "undefined";
        }
        BrowserUtils.hasNavigator = hasNavigator;
        function hasWindow() {
            return typeof window !== "undefined";
        }
        BrowserUtils.hasWindow = hasWindow;
        function isWindows() {
            return hasNavigator() && /(Win32|Win64|WOW64)/i.test(navigator.platform);
        }
        BrowserUtils.isWindows = isWindows;
        function isWindows10() {
            return hasNavigator() && /(Win32|Win64|WOW64)/i.test(navigator.platform) && /Windows NT 10/i.test(navigator.userAgent);
        }
        BrowserUtils.isWindows10 = isWindows10;
        function isMobile() {
            return hasNavigator() && /mobi/i.test(navigator.userAgent);
        }
        BrowserUtils.isMobile = isMobile;
        function isIOS() {
            return hasNavigator() &&
                (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        }
        BrowserUtils.isIOS = isIOS;
        function isAndroid() {
            return hasNavigator() && /android/i.test(navigator.userAgent);
        }
        BrowserUtils.isAndroid = isAndroid;
        //MacIntel on modern Macs
        function isMac() {
            return hasNavigator() && /Mac/i.test(navigator.platform);
        }
        BrowserUtils.isMac = isMac;
        //This is generally appears for Linux
        //Android *sometimes* returns this
        function isLinux() {
            return !!navigator && /Linux/i.test(navigator.platform);
        }
        BrowserUtils.isLinux = isLinux;
        // Detects if we are running on ARM (Raspberry pi)
        function isARM() {
            return hasNavigator() && /arm/i.test(navigator.platform);
        }
        BrowserUtils.isARM = isARM;
        // Detects if we are running inside the UWP runtime (Microsoft Edge)
        function isUwpEdge() {
            return typeof window !== "undefined" && !!window.Windows;
        }
        BrowserUtils.isUwpEdge = isUwpEdge;
        /*
        Notes on browser detection
    
        Actually:             Claims to be:
                              IE  MicrosoftEdge    Chrome  Safari  Firefox
                  IE          X                           X?
        Microsoft Edge                    X       X       X
                  Chrome                          X       X
                  Safari                                  X       X
                  Firefox                                         X
    
        I allow Opera to go about claiming to be Chrome because it might as well be
        */
        //Microsoft Edge lies about its user agent and claims to be Chrome, but Microsoft Edge/Version
        //is always at the end
        function isEdge() {
            return hasNavigator() && /Edge/i.test(navigator.userAgent);
        }
        BrowserUtils.isEdge = isEdge;
        //IE11 also lies about its user agent, but has Trident appear somewhere in
        //the user agent. Detecting the different between IE11 and Microsoft Edge isn't
        //super-important because the UI is similar enough
        function isIE() {
            return hasNavigator() && /Trident/i.test(navigator.userAgent);
        }
        BrowserUtils.isIE = isIE;
        //Microsoft Edge and IE11 lie about being Chrome
        function isChrome() {
            return !isEdge() && !isIE() && !!navigator && (/Chrome/i.test(navigator.userAgent) || /Chromium/i.test(navigator.userAgent));
        }
        BrowserUtils.isChrome = isChrome;
        //Chrome and Microsoft Edge lie about being Safari
        function isSafari() {
            //Could also check isMac but I don't want to risk excluding iOS
            //Checking for iPhone, iPod or iPad as well as Safari in order to detect home screen browsers on iOS
            return !isChrome() && !isEdge() && !!navigator && /(Macintosh|Safari|iPod|iPhone|iPad)/i.test(navigator.userAgent);
        }
        BrowserUtils.isSafari = isSafari;
        //Safari and WebKit lie about being Firefox
        function isFirefox() {
            return !isSafari() && !!navigator && (/Firefox/i.test(navigator.userAgent) || /Seamonkey/i.test(navigator.userAgent));
        }
        BrowserUtils.isFirefox = isFirefox;
        //These days Opera's core is based on Chromium so we shouldn't distinguish between them too much
        function isOpera() {
            return hasNavigator() && /Opera|OPR/i.test(navigator.userAgent);
        }
        BrowserUtils.isOpera = isOpera;
        //Midori *was* the default browser on Raspbian, however isn't any more
        function isMidori() {
            return hasNavigator() && /Midori/i.test(navigator.userAgent);
        }
        BrowserUtils.isMidori = isMidori;
        //Epiphany (code name for GNOME Web) is the default browser on Raspberry Pi
        //Epiphany also lies about being Chrome, Safari, and Chromium
        function isEpiphany() {
            return hasNavigator() && /Epiphany/i.test(navigator.userAgent);
        }
        BrowserUtils.isEpiphany = isEpiphany;
        function isTouchEnabled() {
            return typeof window !== "undefined" &&
                ('ontouchstart' in window // works on most browsers
                    || (navigator && navigator.maxTouchPoints > 0)); // works on IE10/11 and Surface);
        }
        BrowserUtils.isTouchEnabled = isTouchEnabled;
        function isPxtElectron() {
            return typeof window != "undefined" && !!window.pxtElectron;
        }
        BrowserUtils.isPxtElectron = isPxtElectron;
        function isIpcRenderer() {
            return typeof window != "undefined" && !!window.ipcRenderer;
        }
        BrowserUtils.isIpcRenderer = isIpcRenderer;
        function isElectron() {
            return isPxtElectron() || isIpcRenderer();
        }
        BrowserUtils.isElectron = isElectron;
        // this function gets overriden when loading pxtwinrt.js
        BrowserUtils.isWinRT = () => false;
        function isLocalHost(ignoreFlags) {
            var _a;
            try {
                return typeof window !== "undefined"
                    && /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(window.location.href)
                    && (ignoreFlags || !/nolocalhost=1/.test(window.location.href))
                    && !((_a = pxt === null || pxt === void 0 ? void 0 : pxt.webConfig) === null || _a === void 0 ? void 0 : _a.isStatic);
            }
            catch (e) {
                return false;
            }
        }
        BrowserUtils.isLocalHost = isLocalHost;
        function isLocalHostDev() {
            return isLocalHost() && !isElectron();
        }
        BrowserUtils.isLocalHostDev = isLocalHostDev;
        function hasPointerEvents() {
            return typeof window != "undefined" && !!window.PointerEvent;
        }
        BrowserUtils.hasPointerEvents = hasPointerEvents;
        function hasSaveAs() {
            return isEdge() || isIE() || isFirefox();
        }
        BrowserUtils.hasSaveAs = hasSaveAs;
        function os() {
            if (isWindows())
                return "windows";
            else if (isMac())
                return "mac";
            else if (isLinux() && isARM())
                return "rpi";
            else if (isLinux())
                return "linux";
            else
                return "unknown";
        }
        BrowserUtils.os = os;
        function browser() {
            if (isEdge())
                return "edge";
            if (isEpiphany())
                return "epiphany";
            else if (isMidori())
                return "midori";
            else if (isOpera())
                return "opera";
            else if (isIE())
                return "ie";
            else if (isChrome())
                return "chrome";
            else if (isSafari())
                return "safari";
            else if (isFirefox())
                return "firefox";
            else
                return "unknown";
        }
        BrowserUtils.browser = browser;
        function browserVersion() {
            if (!hasNavigator())
                return null;
            //Unsurprisingly browsers also lie about this and include other browser versions...
            let matches = [];
            if (isOpera()) {
                matches = /(Opera|OPR)\/([0-9\.]+)/i.exec(navigator.userAgent);
            }
            if (isEpiphany()) {
                matches = /Epiphany\/([0-9\.]+)/i.exec(navigator.userAgent);
            }
            else if (isMidori()) {
                matches = /Midori\/([0-9\.]+)/i.exec(navigator.userAgent);
            }
            else if (isSafari()) {
                matches = /Version\/([0-9\.]+)/i.exec(navigator.userAgent);
                // pinned web sites and WKWebview for embedded browsers have a different user agent
                // Mozilla/5.0 (iPhone; CPU iPhone OS 10_2_1 like Mac OS X) AppleWebKit/602.4.6 (KHTML, like Gecko) Mobile/14D27
                // Mozilla/5.0 (iPad; CPU OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60
                // Mozilla/5.0 (iPod; CPU OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60
                // Mozilla/5.0 (iPod touch; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;
                // Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/605.1.15 (KHTML, like Gecko)
                if (!matches)
                    matches = /(Macintosh|iPod( touch)?|iPhone|iPad); (CPU|Intel).*?OS (X )?(\d+)/i.exec(navigator.userAgent);
            }
            else if (isChrome()) {
                matches = /(Chrome|Chromium)\/([0-9\.]+)/i.exec(navigator.userAgent);
            }
            else if (isEdge()) {
                matches = /Edge\/([0-9\.]+)/i.exec(navigator.userAgent);
            }
            else if (isIE()) {
                matches = /(MSIE |rv:)([0-9\.]+)/i.exec(navigator.userAgent);
            }
            else {
                matches = /(Firefox|Seamonkey)\/([0-9\.]+)/i.exec(navigator.userAgent);
            }
            if (!matches || matches.length == 0) {
                return null;
            }
            return matches[matches.length - 1];
        }
        BrowserUtils.browserVersion = browserVersion;
        let hasLoggedBrowser = false;
        // Note that IE11 is no longer supported in any target. Redirect handled in docfiles/pxtweb/browserRedirect.ts
        function isBrowserSupported() {
            var _a, _b;
            if (!navigator) {
                return true; //All browsers define this, but we can't make any predictions if it isn't defined, so assume the best
            }
            // allow bots in general
            if (/bot|crawler|spider|crawling/i.test(navigator.userAgent))
                return true;
            // Check target theme to see if this browser is supported
            const unsupportedBrowsers = ((_a = pxt.appTarget) === null || _a === void 0 ? void 0 : _a.unsupportedBrowsers)
                || ((_b = window.pxtTargetBundle) === null || _b === void 0 ? void 0 : _b.unsupportedBrowsers);
            if (unsupportedBrowsers === null || unsupportedBrowsers === void 0 ? void 0 : unsupportedBrowsers.some(b => b.id == browser())) {
                return false;
            }
            // testing browser versions
            const versionString = browserVersion();
            const v = parseInt(versionString || "0");
            const isRecentChrome = isChrome() && v >= 38;
            const isRecentFirefox = isFirefox() && v >= 31;
            const isRecentEdge = isEdge();
            const isRecentSafari = isSafari() && v >= 9;
            const isRecentOpera = (isOpera() && isChrome()) && v >= 21;
            const isModernBrowser = isRecentChrome || isRecentFirefox || isRecentEdge || isRecentSafari || isRecentOpera;
            //In the future this should check for the availability of features, such
            //as web workers
            let isSupported = isModernBrowser;
            const isUnsupportedRPI = isMidori() || (isLinux() && isARM() && isEpiphany());
            const isNotSupported = isUnsupportedRPI;
            isSupported = isSupported && !isNotSupported;
            //Bypass
            isSupported = isSupported || /anybrowser=(true|1)/.test(window.location.href);
            if (!hasLoggedBrowser) {
                pxt.log(`Browser: ${browser()} ${versionString} on ${os()}`);
                if (!isSupported) {
                    pxt.tickEvent("browser.unsupported", { useragent: navigator.userAgent });
                }
                hasLoggedBrowser = true;
            }
            return isSupported;
        }
        BrowserUtils.isBrowserSupported = isBrowserSupported;
        function devicePixelRatio() {
            if (typeof window === "undefined" || !window.screen)
                return 1;
            // these are IE specific
            const sysXDPI = window.screen.systemXDPI;
            const logicalXDPI = window.screen.logicalXDPI;
            if (sysXDPI !== undefined
                && logicalXDPI !== undefined
                && sysXDPI > logicalXDPI) {
                return sysXDPI / logicalXDPI;
            }
            else if (window && window.devicePixelRatio !== undefined) {
                return window.devicePixelRatio;
            }
            return 1;
        }
        BrowserUtils.devicePixelRatio = devicePixelRatio;
        function browserDownloadBinText(text, name, opt) {
            return browserDownloadBase64(ts.pxtc.encodeBase64(text), name, opt);
        }
        BrowserUtils.browserDownloadBinText = browserDownloadBinText;
        function browserDownloadText(text, name, opt) {
            return browserDownloadBase64(ts.pxtc.encodeBase64(pxt.Util.toUTF8(text)), name, opt);
        }
        BrowserUtils.browserDownloadText = browserDownloadText;
        function isBrowserDownloadInSameWindow() {
            const windowOpen = isMobile() && isSafari() && !/downloadWindowOpen=0/i.test(window.location.href);
            return windowOpen;
        }
        BrowserUtils.isBrowserDownloadInSameWindow = isBrowserDownloadInSameWindow;
        // for browsers that strictly require that a download gets initiated within a user click
        function isBrowserDownloadWithinUserContext() {
            const versionString = browserVersion();
            const v = parseInt(versionString || "0");
            const r = (isMobile() && isSafari() && v >= 11) || /downloadUserContext=1/i.test(window.location.href);
            return r;
        }
        BrowserUtils.isBrowserDownloadWithinUserContext = isBrowserDownloadWithinUserContext;
        function browserDownloadDataUri(uri, name, userContextWindow) {
            const windowOpen = isBrowserDownloadInSameWindow();
            const versionString = browserVersion();
            const v = parseInt(versionString || "0");
            if (windowOpen) {
                if (userContextWindow)
                    userContextWindow.location.href = uri;
                else
                    window.open(uri, "_self");
            }
            else if (pxt.BrowserUtils.isSafari()
                && (v < 10 || (versionString.indexOf('10.0') == 0) || isMobile())) {
                // For Safari versions prior to 10.1 and all Mobile Safari versions
                // For mysterious reasons, the "link" trick closes the
                // PouchDB database
                let iframe = document.getElementById("downloader");
                if (!iframe) {
                    pxt.debug('injecting downloader iframe');
                    iframe = document.createElement("iframe");
                    iframe.id = "downloader";
                    iframe.style.position = "absolute";
                    iframe.style.right = "0";
                    iframe.style.bottom = "0";
                    iframe.style.zIndex = "-1";
                    iframe.style.width = "1px";
                    iframe.style.height = "1px";
                    document.body.appendChild(iframe);
                }
                iframe.src = uri;
            }
            else if (/^data:/i.test(uri) && (pxt.BrowserUtils.isEdge() || pxt.BrowserUtils.isIE())) {
                //Fix for edge
                let byteString = atob(uri.split(',')[1]);
                let ia = pxt.Util.stringToUint8Array(byteString);
                let blob = new Blob([ia], { type: "img/png" });
                window.navigator.msSaveOrOpenBlob(blob, name);
            }
            else {
                let link = window.document.createElement('a');
                if (typeof link.download == "string") {
                    link.href = uri;
                    link.download = name;
                    document.body.appendChild(link); // for FF
                    link.click();
                    document.body.removeChild(link);
                }
                else {
                    document.location.href = uri;
                }
            }
        }
        BrowserUtils.browserDownloadDataUri = browserDownloadDataUri;
        function browserDownloadUInt8Array(buf, name, opt) {
            return browserDownloadBase64(ts.pxtc.encodeBase64(pxt.Util.uint8ArrayToString(buf)), name, opt);
        }
        BrowserUtils.browserDownloadUInt8Array = browserDownloadUInt8Array;
        function toDownloadDataUri(b64, contentType) {
            let protocol = "data";
            if (isMobile() && isSafari() && pxt.appTarget.appTheme.mobileSafariDownloadProtocol)
                protocol = pxt.appTarget.appTheme.mobileSafariDownloadProtocol;
            const m = /downloadProtocol=([a-z0-9:/?]+)/i.exec(window.location.href);
            if (m)
                protocol = m[1];
            const dataurl = protocol + ":" + contentType + ";base64," + b64;
            return dataurl;
        }
        BrowserUtils.toDownloadDataUri = toDownloadDataUri;
        function browserDownloadBase64(b64, name, opt = {}) {
            var _a;
            pxt.debug('trigger download');
            const { contentType = "application/octet-stream", userContextWindow, onError, maintainObjectURL } = opt;
            const createObjectURL = (_a = window.URL) === null || _a === void 0 ? void 0 : _a.createObjectURL;
            const asDataUri = pxt.appTarget.appTheme.disableBlobObjectDownload;
            let downloadurl;
            try {
                if (!!createObjectURL && !asDataUri) {
                    const b = new Blob([pxt.Util.stringToUint8Array(atob(b64))], { type: contentType });
                    const objUrl = createObjectURL(b);
                    browserDownloadDataUri(objUrl, name, userContextWindow);
                    if (maintainObjectURL) {
                        downloadurl = objUrl;
                    }
                    else {
                        window.setTimeout(() => window.URL.revokeObjectURL(downloadurl), 0);
                    }
                }
                else {
                    downloadurl = toDownloadDataUri(b64, name);
                    browserDownloadDataUri(downloadurl, name, userContextWindow);
                }
            }
            catch (e) {
                if (onError)
                    onError(e);
                pxt.debug("saving failed");
            }
            return downloadurl;
        }
        BrowserUtils.browserDownloadBase64 = browserDownloadBase64;
        function loadImageAsync(data) {
            const img = document.createElement("img");
            return new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = () => resolve(undefined);
                img.crossOrigin = "anonymous";
                img.src = data;
            });
        }
        BrowserUtils.loadImageAsync = loadImageAsync;
        function loadCanvasAsync(url) {
            return loadImageAsync(url)
                .then(img => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                return canvas;
            });
        }
        BrowserUtils.loadCanvasAsync = loadCanvasAsync;
        function scaleImageData(img, scale) {
            const cvs = document.createElement("canvas");
            cvs.width = img.width * scale;
            cvs.height = img.height * scale;
            const ctx = cvs.getContext("2d");
            ctx.putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.scale(scale, scale);
            ctx.drawImage(cvs, 0, 0);
            return ctx.getImageData(0, 0, img.width * scale, img.height * scale);
        }
        BrowserUtils.scaleImageData = scaleImageData;
        function imageDataToPNG(img, scale = 1) {
            if (!img)
                return undefined;
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.scale(scale, scale);
            ctx.drawImage(canvas, 0, 0);
            return canvas.toDataURL("image/png");
        }
        BrowserUtils.imageDataToPNG = imageDataToPNG;
        const MAX_SCREENSHOT_SIZE = 1e6; // max 1Mb
        function encodeToPngAsync(dataUri, options) {
            const { width, height, pixelDensity = 4, maxSize = MAX_SCREENSHOT_SIZE, text } = options || {};
            return new Promise((resolve, reject) => {
                const img = new Image;
                img.onload = function () {
                    const cvs = document.createElement("canvas");
                    const ctx = cvs.getContext("2d");
                    cvs.width = (width || img.width) * pixelDensity;
                    cvs.height = (height || img.height) * pixelDensity;
                    if (text) {
                        ctx.fillStyle = "#fff";
                        ctx.fillRect(0, 0, cvs.width, cvs.height);
                    }
                    ctx.drawImage(img, 0, 0, width, height, 0, 0, cvs.width, cvs.height);
                    let canvasdata = cvs.toDataURL("image/png");
                    // if the generated image is too big, shrink image
                    while (canvasdata.length > maxSize) {
                        cvs.width = (cvs.width / 2) >> 0;
                        cvs.height = (cvs.height / 2) >> 0;
                        pxt.debug(`screenshot size ${canvasdata.length}b, shrinking to ${cvs.width}x${cvs.height}`);
                        ctx.drawImage(img, 0, 0, width, height, 0, 0, cvs.width, cvs.height);
                        canvasdata = cvs.toDataURL("image/png");
                    }
                    if (text) {
                        let p = pxt.lzmaCompressAsync(text).then(blob => {
                            const datacvs = pxt.Util.encodeBlobAsync(cvs, blob);
                            resolve(datacvs.toDataURL("image/png"));
                        });
                    }
                    else {
                        resolve(canvasdata);
                    }
                };
                img.onerror = ev => {
                    pxt.reportError("png", "png rendering failed");
                    resolve(undefined);
                };
                img.src = dataUri;
            });
        }
        BrowserUtils.encodeToPngAsync = encodeToPngAsync;
        function resolveCdnUrl(path) {
            // don't expand full urls
            if (/^https?:\/\//i.test(path))
                return path;
            const monacoPaths = window.MonacoPaths || {};
            const blobPath = monacoPaths[path];
            // find compute blob url
            if (blobPath)
                return blobPath;
            // might have been exanded already
            if (pxt.U.startsWith(path, pxt.webConfig.commitCdnUrl))
                return path;
            // append CDN
            return pxt.webConfig.commitCdnUrl + path;
        }
        BrowserUtils.resolveCdnUrl = resolveCdnUrl;
        function loadStyleAsync(path, rtl) {
            if (rtl)
                path = "rtl" + path;
            const id = "style-" + path;
            if (document.getElementById(id))
                return Promise.resolve();
            const url = resolveCdnUrl(path);
            const links = pxt.Util.toArray(document.head.getElementsByTagName("link"));
            const link = links.filter(l => l.getAttribute("href") == url)[0];
            if (link) {
                if (!link.id)
                    link.id = id;
                return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
                const el = document.createElement("link");
                el.href = url;
                el.rel = "stylesheet";
                el.type = "text/css";
                el.id = id;
                el.addEventListener('load', () => resolve());
                el.addEventListener('error', (e) => reject(e));
                document.head.appendChild(el);
            });
        }
        BrowserUtils.loadStyleAsync = loadStyleAsync;
        let loadScriptPromises = {};
        function loadScriptAsync(path) {
            const url = resolveCdnUrl(path);
            let p = loadScriptPromises[url];
            if (!p) {
                p = loadScriptPromises[url] = new Promise((resolve, reject) => {
                    pxt.debug(`script: loading ${url}`);
                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.addEventListener('load', () => resolve());
                    script.addEventListener('error', (e) => {
                        // might have had connection issue, allow to try later
                        delete loadScriptPromises[url];
                        reject(e);
                    });
                    script.src = url;
                    script.async = true;
                    document.body.appendChild(script);
                });
            }
            return p;
        }
        BrowserUtils.loadScriptAsync = loadScriptAsync;
        function loadAjaxAsync(url) {
            return new Promise((resolve, reject) => {
                let httprequest = new XMLHttpRequest();
                httprequest.onreadystatechange = function () {
                    if (httprequest.readyState == XMLHttpRequest.DONE) {
                        if (httprequest.status == 200) {
                            resolve(httprequest.responseText);
                        }
                        else {
                            reject(httprequest.status);
                        }
                    }
                };
                httprequest.open("GET", url, true);
                httprequest.send();
            });
        }
        BrowserUtils.loadAjaxAsync = loadAjaxAsync;
        let loadBlocklyPromise;
        function loadBlocklyAsync() {
            if (!loadBlocklyPromise) {
                pxt.debug(`blockly: delay load`);
                let p = pxt.BrowserUtils.loadStyleAsync("blockly.css", ts.pxtc.Util.isUserLanguageRtl());
                // js not loaded yet?
                if (typeof Blockly === "undefined")
                    p = p.then(() => pxt.BrowserUtils.loadScriptAsync("pxtblockly.js"));
                p = p.then(() => {
                    pxt.debug(`blockly: loaded`);
                });
                loadBlocklyPromise = p;
            }
            return loadBlocklyPromise;
        }
        BrowserUtils.loadBlocklyAsync = loadBlocklyAsync;
        function patchCdn(url) {
            if (!url)
                return url;
            const online = pxt.getOnlineCdnUrl();
            if (online)
                return url.replace("@cdnUrl@", online);
            else
                return url.replace(/@cdnUrl@\/(blob|commit)\/[a-f0-9]{40}\//, "./");
        }
        BrowserUtils.patchCdn = patchCdn;
        function initTheme() {
            const theme = pxt.appTarget.appTheme;
            if (theme) {
                if (theme.accentColor) {
                    let style = document.createElement('style');
                    style.type = 'text/css';
                    style.appendChild(document.createTextNode(`.ui.accent { color: ${theme.accentColor}; }
                .ui.inverted.menu .accent.active.item, .ui.inverted.accent.menu  { background-color: ${theme.accentColor}; }`));
                    document.getElementsByTagName('head')[0].appendChild(style);
                }
            }
            // RTL languages
            if (pxt.Util.isUserLanguageRtl()) {
                pxt.debug("rtl layout");
                pxt.BrowserUtils.addClass(document.body, "rtl");
                document.body.style.direction = "rtl";
                // replace semantic.css with rtlsemantic.css
                const links = pxt.Util.toArray(document.head.getElementsByTagName("link"));
                const semanticLink = links.filter(l => pxt.Util.endsWith(l.getAttribute("href"), "semantic.css"))[0];
                if (semanticLink) {
                    const semanticHref = semanticLink.getAttribute("data-rtl");
                    if (semanticHref) {
                        pxt.debug(`swapping to ${semanticHref}`);
                        semanticLink.setAttribute("href", semanticHref);
                    }
                }
                // replace blockly.css with rtlblockly.css if possible
                const blocklyLink = links.filter(l => pxt.Util.endsWith(l.getAttribute("href"), "blockly.css"))[0];
                if (blocklyLink) {
                    const blocklyHref = blocklyLink.getAttribute("data-rtl");
                    if (blocklyHref) {
                        pxt.debug(`swapping to ${blocklyHref}`);
                        blocklyLink.setAttribute("href", blocklyHref);
                        blocklyLink.removeAttribute("data-rtl");
                    }
                }
            }
        }
        BrowserUtils.initTheme = initTheme;
        /**
         * Utility method to change the hash.
         * Pass keepHistory to retain an entry of the change in the browser history.
         */
        function changeHash(hash, keepHistory) {
            if (hash.charAt(0) != '#')
                hash = '#' + hash;
            if (keepHistory) {
                window.location.hash = hash;
            }
            else {
                window.history.replaceState('', '', hash);
            }
        }
        BrowserUtils.changeHash = changeHash;
        /**
         * Simple utility method to join urls.
         */
        function urlJoin(urlPath1, urlPath2) {
            if (!urlPath1)
                return urlPath2;
            if (!urlPath2)
                return urlPath1;
            const normalizedUrl1 = (urlPath1.indexOf('/') == urlPath1.length - 1) ?
                urlPath1.substring(0, urlPath1.length - 1) : urlPath1;
            const normalizedUrl2 = (urlPath2.indexOf('/') == 0) ?
                urlPath2.substring(1) : urlPath2;
            return normalizedUrl1 + "/" + normalizedUrl2;
        }
        BrowserUtils.urlJoin = urlJoin;
        /**
         * Simple utility method to join multiple urls.
         */
        function joinURLs(...parts) {
            let result;
            if (parts) {
                for (let i = 0; i < parts.length; i++) {
                    result = urlJoin(result, parts[i]);
                }
            }
            return result;
        }
        BrowserUtils.joinURLs = joinURLs;
        function storageEstimateAsync() {
            const nav = hasNavigator() && window.navigator;
            if (nav && nav.storage && nav.storage.estimate)
                return nav.storage.estimate();
            else
                return Promise.resolve({});
        }
        BrowserUtils.storageEstimateAsync = storageEstimateAsync;
        BrowserUtils.scheduleStorageCleanup = hasNavigator() && navigator.storage && navigator.storage.estimate // some browser don't support this
            ? ts.pxtc.Util.throttle(function () {
                const MIN_QUOTA = 1000000; // 1Mb
                const MAX_USAGE_RATIO = 0.9; // max 90%
                storageEstimateAsync()
                    .then(estimate => {
                    // quota > 50%
                    pxt.debug(`storage estimate: ${(estimate.usage / estimate.quota * 100) >> 0}%, ${(estimate.usage / 1000000) >> 0}/${(estimate.quota / 1000000) >> 0}Mb`);
                    if (estimate.quota
                        && estimate.usage
                        && estimate.quota > MIN_QUOTA
                        && (estimate.usage / estimate.quota) > MAX_USAGE_RATIO) {
                        pxt.log(`quota usage exceeded, clearing translations`);
                        pxt.tickEvent('storage.cleanup');
                        return clearTranslationDbAsync();
                    }
                    return Promise.resolve();
                })
                    .catch(e => {
                    pxt.reportException(e);
                });
            }, 10000, false)
            : () => { };
        function stressTranslationsAsync() {
            let md = "...";
            for (let i = 0; i < 16; ++i)
                md += md + Math.random();
            console.log(`adding entry ${md.length * 2} bytes`);
            return pxt.U.delay(1)
                .then(() => translationDbAsync())
                .then(db => db.setAsync("foobar", Math.random().toString(), "", null, undefined, md))
                .then(() => pxt.BrowserUtils.storageEstimateAsync())
                .then(estimate => !estimate.quota || estimate.usage / estimate.quota < 0.8 ? stressTranslationsAsync() : Promise.resolve());
        }
        BrowserUtils.stressTranslationsAsync = stressTranslationsAsync;
        class MemTranslationDb {
            constructor() {
                this.translations = {};
            }
            key(lang, filename, branch) {
                return `${lang}|${filename}|${branch || "master"}`;
            }
            get(lang, filename, branch) {
                return this.translations[this.key(lang, filename, branch)];
            }
            getAsync(lang, filename, branch) {
                return Promise.resolve(this.get(lang, filename, branch));
            }
            set(lang, filename, branch, etag, time, strings, md) {
                this.translations[this.key(lang, filename, branch)] = {
                    etag,
                    time,
                    strings,
                    md
                };
            }
            setAsync(lang, filename, branch, etag, strings, md) {
                this.set(lang, filename, branch, etag, pxt.Util.now(), strings);
                return Promise.resolve();
            }
            clearAsync() {
                this.translations = {};
                return Promise.resolve();
            }
        }
        class IDBWrapper {
            constructor(name, version, upgradeHandler, quotaExceededHandler) {
                this.name = name;
                this.version = version;
                this.upgradeHandler = upgradeHandler;
                this.quotaExceededHandler = quotaExceededHandler;
            }
            throwIfNotOpened() {
                if (!this._db) {
                    throw new Error("Database not opened; call IDBWrapper.openAsync() first");
                }
            }
            errorHandler(err, op, reject) {
                console.error(new Error(`${this.name} IDBWrapper error for ${op}: ${err.message}`));
                reject(err);
                // special case for quota exceeded
                if (err.name == "QuotaExceededError") {
                    // oops, we ran out of space
                    pxt.log(`storage quota exceeded...`);
                    pxt.tickEvent('storage.quotaexceedederror');
                    if (this.quotaExceededHandler)
                        this.quotaExceededHandler();
                }
            }
            getObjectStore(name, mode = "readonly") {
                this.throwIfNotOpened();
                const transaction = this._db.transaction([name], mode);
                return transaction.objectStore(name);
            }
            static deleteDatabaseAsync(name) {
                return new Promise((resolve, reject) => {
                    const idbFactory = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
                    const request = idbFactory.deleteDatabase(name);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
            openAsync() {
                return new Promise((resolve, reject) => {
                    const idbFactory = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
                    const request = idbFactory.open(this.name, this.version);
                    request.onsuccess = () => {
                        this._db = request.result;
                        resolve();
                    };
                    request.onerror = () => this.errorHandler(request.error, "open", reject);
                    request.onupgradeneeded = (ev) => this.upgradeHandler(ev, request);
                });
            }
            getAsync(storeName, id) {
                return new Promise((resolve, reject) => {
                    const store = this.getObjectStore(storeName);
                    const request = store.get(id);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => this.errorHandler(request.error, "get", reject);
                });
            }
            getAllAsync(storeName) {
                return new Promise((resolve, reject) => {
                    const store = this.getObjectStore(storeName);
                    const cursor = store.openCursor();
                    const data = [];
                    cursor.onsuccess = () => {
                        if (cursor.result) {
                            data.push(cursor.result.value);
                            cursor.result.continue();
                        }
                        else {
                            resolve(data);
                        }
                    };
                    cursor.onerror = () => this.errorHandler(cursor.error, "getAll", reject);
                });
            }
            setAsync(storeName, data) {
                return new Promise((resolve, reject) => {
                    const store = this.getObjectStore(storeName, "readwrite");
                    let request;
                    if (typeof data.id !== "undefined" && data.id !== null) {
                        request = store.put(data);
                    }
                    else {
                        request = store.add(data);
                    }
                    request.onsuccess = () => resolve();
                    request.onerror = () => this.errorHandler(request.error, "set", reject);
                });
            }
            deleteAsync(storeName, id) {
                return new Promise((resolve, reject) => {
                    const store = this.getObjectStore(storeName, "readwrite");
                    const request = store.delete(id);
                    request.onsuccess = () => resolve();
                    request.onerror = () => this.errorHandler(request.error, "delete", reject);
                });
            }
            deleteAllAsync(storeName) {
                return new Promise((resolve, reject) => {
                    const store = this.getObjectStore(storeName, "readwrite");
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => this.errorHandler(request.error, "deleteAll", reject);
                });
            }
        }
        BrowserUtils.IDBWrapper = IDBWrapper;
        class IndexedDbTranslationDb {
            constructor(db) {
                this.db = db;
                this.mem = new MemTranslationDb();
            }
            static dbName() {
                return `__pxt_translations_${pxt.appTarget.id || ""}`;
            }
            static createAsync() {
                function openAsync() {
                    const idbWrapper = new IDBWrapper(IndexedDbTranslationDb.dbName(), 2, (ev, r) => {
                        const db = r.result;
                        db.createObjectStore(IndexedDbTranslationDb.TABLE, { keyPath: IndexedDbTranslationDb.KEYPATH });
                    }, () => {
                        // quota exceeeded, delete db
                        clearTranslationDbAsync().catch(e => { });
                    });
                    return idbWrapper.openAsync()
                        .then(() => new IndexedDbTranslationDb(idbWrapper));
                }
                return openAsync()
                    .catch(e => {
                    console.log(`db: failed to open database, try delete entire store...`);
                    return IDBWrapper.deleteDatabaseAsync(IndexedDbTranslationDb.dbName())
                        .then(() => openAsync());
                });
            }
            getAsync(lang, filename, branch) {
                lang = (lang || "en-US").toLowerCase(); // normalize locale
                const id = this.mem.key(lang, filename, branch);
                const r = this.mem.get(lang, filename, branch);
                if (r)
                    return Promise.resolve(r);
                return this.db.getAsync(IndexedDbTranslationDb.TABLE, id)
                    .then((res) => {
                    if (res) {
                        // store in-memory so that we don't try to download again
                        this.mem.set(lang, filename, branch, res.etag, res.time, res.strings);
                        return Promise.resolve(res);
                    }
                    return Promise.resolve(undefined);
                })
                    .catch((e) => {
                    return Promise.resolve(undefined);
                });
            }
            setAsync(lang, filename, branch, etag, strings, md) {
                lang = (lang || "en-US").toLowerCase(); // normalize locale
                const id = this.mem.key(lang, filename, branch);
                let time = pxt.Util.now();
                this.mem.set(lang, filename, branch, etag, time, strings, md);
                if (strings) {
                    Object.keys(strings).filter(k => !strings[k]).forEach(k => delete strings[k]);
                }
                const entry = {
                    id,
                    etag,
                    time,
                    strings,
                    md
                };
                return this.db.setAsync(IndexedDbTranslationDb.TABLE, entry)
                    .finally(() => BrowserUtils.scheduleStorageCleanup()) // schedule a cleanpu
                    .catch((e) => {
                    console.log(`db: set failed (${e.message}), recycling...`);
                    return this.clearAsync();
                });
            }
            clearAsync() {
                return this.db.deleteAllAsync(IndexedDbTranslationDb.TABLE)
                    .then(() => console.debug(`db: all clean`))
                    .catch(e => {
                    console.error('db: failed to delete all');
                });
            }
        }
        IndexedDbTranslationDb.TABLE = "files";
        IndexedDbTranslationDb.KEYPATH = "id";
        // wired up in the app to store translations in pouchdb. MAY BE UNDEFINED!
        let _translationDbPromise;
        function translationDbAsync() {
            if (pxt.Util.isNodeJS)
                return Promise.resolve(new MemTranslationDb());
            // try indexed db
            if (!_translationDbPromise)
                _translationDbPromise = IndexedDbTranslationDb.createAsync()
                    .catch(() => new MemTranslationDb());
            return _translationDbPromise;
        }
        BrowserUtils.translationDbAsync = translationDbAsync;
        function clearTranslationDbAsync() {
            function deleteDbAsync() {
                const n = IndexedDbTranslationDb.dbName();
                return IDBWrapper.deleteDatabaseAsync(n)
                    .then(() => {
                    _translationDbPromise = undefined;
                })
                    .catch(e => {
                    pxt.log(`db: failed to delete ${n}`);
                    _translationDbPromise = undefined;
                });
            }
            if (!_translationDbPromise)
                return deleteDbAsync();
            return _translationDbPromise
                .then(db => db.clearAsync())
                .catch(e => deleteDbAsync().then());
        }
        BrowserUtils.clearTranslationDbAsync = clearTranslationDbAsync;
        function getTutorialCodeHash(code) {
            // the code strings are parsed from markdown, so when the
            // markdown changes the blocks will also be invalidated
            const input = JSON.stringify(code) + pxt.appTarget.versions.pxt + "_" + pxt.appTarget.versions.target;
            return pxtc.U.sha256(input);
        }
        BrowserUtils.getTutorialCodeHash = getTutorialCodeHash;
        function getTutorialInfoKey(filename, branch) {
            return `${filename}|${branch || "master"}`;
        }
        class TutorialInfoIndexedDb {
            constructor(db) {
                this.db = db;
            }
            static dbName() {
                return `__pxt_tutorialinfo_${pxt.appTarget.id || ""}`;
            }
            static createAsync() {
                function openAsync() {
                    const idbWrapper = new pxt.BrowserUtils.IDBWrapper(TutorialInfoIndexedDb.dbName(), 2, (ev, r) => {
                        const db = r.result;
                        db.createObjectStore(TutorialInfoIndexedDb.TABLE, { keyPath: TutorialInfoIndexedDb.KEYPATH });
                    }, () => {
                        // quota exceeeded, clear db
                        pxt.BrowserUtils.IDBWrapper.deleteDatabaseAsync(TutorialInfoIndexedDb.dbName());
                    });
                    return idbWrapper.openAsync()
                        .then(() => new TutorialInfoIndexedDb(idbWrapper));
                }
                return openAsync()
                    .catch(e => {
                    console.log(`db: failed to open tutorial info database, try delete entire store...`);
                    return pxt.BrowserUtils.IDBWrapper.deleteDatabaseAsync(TutorialInfoIndexedDb.dbName())
                        .then(() => openAsync());
                });
            }
            getAsync(filename, code, branch) {
                const key = getTutorialInfoKey(filename, branch);
                const hash = getTutorialCodeHash(code);
                return this.db.getAsync(TutorialInfoIndexedDb.TABLE, key)
                    .then((res) => {
                    if (res && res.hash == hash) {
                        return res;
                    }
                    // delete stale db entry
                    this.db.deleteAsync(TutorialInfoIndexedDb.TABLE, key);
                    return undefined;
                });
            }
            setAsync(filename, snippets, code, branch) {
                pxt.perf.measureStart("tutorial info db setAsync");
                const key = getTutorialInfoKey(filename, branch);
                const hash = getTutorialCodeHash(code);
                return this.setWithHashAsync(filename, snippets, hash);
            }
            setWithHashAsync(filename, snippets, hash, branch) {
                pxt.perf.measureStart("tutorial info db setAsync");
                const key = getTutorialInfoKey(filename, branch);
                const blocks = {};
                Object.keys(snippets).forEach(hash => {
                    Object.keys(snippets[hash]).forEach(blockId => {
                        blocks[blockId] = snippets[hash][blockId];
                    });
                });
                const entry = {
                    id: key,
                    hash,
                    snippets,
                    blocks
                };
                return this.db.setAsync(TutorialInfoIndexedDb.TABLE, entry)
                    .then(() => {
                    pxt.perf.measureEnd("tutorial info db setAsync");
                });
            }
            clearAsync() {
                return this.db.deleteAllAsync(TutorialInfoIndexedDb.TABLE)
                    .then(() => console.debug(`db: all clean`))
                    .catch(e => {
                    console.error('db: failed to delete all');
                });
            }
        }
        TutorialInfoIndexedDb.TABLE = "info";
        TutorialInfoIndexedDb.KEYPATH = "id";
        let _tutorialInfoDbPromise;
        function tutorialInfoDbAsync() {
            if (!_tutorialInfoDbPromise)
                _tutorialInfoDbPromise = TutorialInfoIndexedDb.createAsync();
            return _tutorialInfoDbPromise;
        }
        BrowserUtils.tutorialInfoDbAsync = tutorialInfoDbAsync;
        function clearTutorialInfoDbAsync() {
            function deleteDbAsync() {
                const n = TutorialInfoIndexedDb.dbName();
                return IDBWrapper.deleteDatabaseAsync(n)
                    .then(() => {
                    _tutorialInfoDbPromise = undefined;
                })
                    .catch(e => {
                    pxt.log(`db: failed to delete ${n}`);
                    _tutorialInfoDbPromise = undefined;
                });
            }
            if (!_tutorialInfoDbPromise)
                return deleteDbAsync();
            return _tutorialInfoDbPromise
                .then(db => db.clearAsync())
                .catch(e => deleteDbAsync().then());
        }
        BrowserUtils.clearTutorialInfoDbAsync = clearTutorialInfoDbAsync;
        BrowserUtils.pointerEvents = (() => {
            if (hasPointerEvents()) {
                return {
                    up: "pointerup",
                    down: ["pointerdown"],
                    move: "pointermove",
                    enter: "pointerenter",
                    leave: "pointerleave"
                };
            }
            else if (isTouchEnabled()) {
                return {
                    up: "mouseup",
                    down: ["mousedown", "touchstart"],
                    move: "touchmove",
                    enter: "touchenter",
                    leave: "touchend"
                };
            }
            else {
                return {
                    up: "mouseup",
                    down: ["mousedown"],
                    move: "mousemove",
                    enter: "mouseenter",
                    leave: "mouseleave"
                };
            }
        })();
        function getPageX(event) {
            if ("pageX" in event) {
                return event.pageX;
            }
            else {
                return event.changedTouches[0].pageX;
            }
        }
        BrowserUtils.getPageX = getPageX;
        function getPageY(event) {
            if ("pageY" in event) {
                return event.pageY;
            }
            else {
                return event.changedTouches[0].pageY;
            }
        }
        BrowserUtils.getPageY = getPageY;
        function getClientX(event) {
            if ("clientX" in event) {
                return event.clientX;
            }
            else {
                return event.changedTouches[0].clientX;
            }
        }
        BrowserUtils.getClientX = getClientX;
        function getClientY(event) {
            if ("clientY" in event) {
                return event.clientY;
            }
            else {
                return event.changedTouches[0].clientY;
            }
        }
        BrowserUtils.getClientY = getClientY;
        function popupWindow(url, title, popUpWidth, popUpHeight) {
            try {
                const winLeft = window.screenLeft ? window.screenLeft : window.screenX;
                const winTop = window.screenTop ? window.screenTop : window.screenY;
                const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
                const left = ((width / 2) - (popUpWidth / 2)) + winLeft;
                const top = ((height / 2) - (popUpHeight / 2)) + winTop;
                const popupWindow = window.open(url, title, "width=" + popUpWidth + ", height=" + popUpHeight + ", top=" + top + ", left=" + left);
                if (popupWindow.focus) {
                    popupWindow.focus();
                }
                return popupWindow;
            }
            catch (e) {
                // Error opening popup
                pxt.tickEvent('pxt.popupError', { url: url, msg: e.message });
                return null;
            }
        }
        BrowserUtils.popupWindow = popupWindow;
        // Keep these helpers unified with pxtsim/runtime.ts
        function containsClass(el, classes) {
            return splitClasses(classes).every(cls => containsSingleClass(el, cls));
            function containsSingleClass(el, cls) {
                if (el.classList) {
                    return el.classList.contains(cls);
                }
                else {
                    const classes = (el.className + "").split(/\s+/);
                    return !(classes.indexOf(cls) < 0);
                }
            }
        }
        BrowserUtils.containsClass = containsClass;
        function addClass(el, classes) {
            splitClasses(classes).forEach(cls => addSingleClass(el, cls));
            function addSingleClass(el, cls) {
                if (el.classList) {
                    el.classList.add(cls);
                }
                else {
                    const classes = (el.className + "").split(/\s+/);
                    if (classes.indexOf(cls) < 0) {
                        el.className.baseVal += " " + cls;
                    }
                }
            }
        }
        BrowserUtils.addClass = addClass;
        function removeClass(el, classes) {
            splitClasses(classes).forEach(cls => removeSingleClass(el, cls));
            function removeSingleClass(el, cls) {
                if (el.classList) {
                    el.classList.remove(cls);
                }
                else {
                    el.className.baseVal = (el.className + "")
                        .split(/\s+/)
                        .filter(c => c != cls)
                        .join(" ");
                }
            }
        }
        BrowserUtils.removeClass = removeClass;
        function splitClasses(classes) {
            return classes.split(/\s+/).filter(s => !!s);
        }
        function getCookieLang() {
            const cookiePropRegex = new RegExp(`${pxt.Util.escapeForRegex(pxt.Util.pxtLangCookieId)}=(.*?)(?:;|$)`);
            const cookieValue = cookiePropRegex.exec(document.cookie);
            return cookieValue && cookieValue[1] || null;
        }
        BrowserUtils.getCookieLang = getCookieLang;
        function setCookieLang(langId, docs = false) {
            if (!pxt.Util.allLanguages[langId]) {
                return;
            }
            if (langId !== getCookieLang()) {
                pxt.tickEvent(`menu.lang.setcookielang`, { lang: langId, docs: `${docs}` });
                const expiration = new Date();
                expiration.setTime(expiration.getTime() + (pxt.Util.langCookieExpirationDays * 24 * 60 * 60 * 1000));
                document.cookie = `${pxt.Util.pxtLangCookieId}=${langId}; expires=${expiration.toUTCString()}; path=/`;
            }
        }
        BrowserUtils.setCookieLang = setCookieLang;
        function cacheBustingUrl(url) {
            if (!url)
                return url;
            if (/[?&]rnd=/.test(url))
                return url; // already busted
            return `${url}${url.indexOf('?') > 0 ? "&" : "?"}rnd=${Math.random()}`;
        }
        BrowserUtils.cacheBustingUrl = cacheBustingUrl;
    })(BrowserUtils = pxt.BrowserUtils || (pxt.BrowserUtils = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var commands;
    (function (commands) {
        commands.deployCoreAsync = undefined;
        commands.deployFallbackAsync = undefined;
        commands.hasDeployFn = () => commands.deployCoreAsync || commands.deployFallbackAsync;
        commands.deployAsync = (r, d) => {
            return (commands.deployCoreAsync || commands.deployFallbackAsync)(r, d);
        };
        commands.patchCompileResultAsync = undefined;
        commands.browserDownloadAsync = undefined;
        commands.saveOnlyAsync = undefined;
        commands.renderBrowserDownloadInstructions = undefined;
        commands.renderUsbPairDialog = undefined;
        commands.renderIncompatibleHardwareDialog = undefined;
        commands.showUploadInstructionsAsync = undefined;
        commands.saveProjectAsync = undefined;
        commands.electronDeployAsync = undefined; // A pointer to the Electron deploy function, so that targets can access it in their extension.ts
        commands.webUsbPairDialogAsync = undefined;
        commands.onTutorialCompleted = undefined;
    })(commands = pxt.commands || (pxt.commands = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/pxtarget.d.ts"/>
var pxt;
(function (pxt) {
    let lzmaPromise;
    function getLzmaAsync() {
        let lzmaPromise;
        if (!lzmaPromise) {
            if (pxt.U.isNodeJS)
                lzmaPromise = Promise.resolve(require("lzma"));
            else
                lzmaPromise = Promise.resolve(window.LZMA);
            lzmaPromise.then(res => {
                if (!res)
                    pxt.reportError('lzma', 'failed to load');
                return res;
            });
        }
        return lzmaPromise;
    }
    function lzmaDecompressAsync(buf) {
        return getLzmaAsync()
            .then(lzma => new Promise((resolve, reject) => {
            try {
                lzma.decompress(buf, (res, error) => {
                    if (error)
                        pxt.debug(`lzma decompression failed`);
                    resolve(error ? undefined : res);
                });
            }
            catch (e) {
                if (e)
                    pxt.debug(`lzma decompression failed`);
                resolve(undefined);
            }
        }));
    }
    pxt.lzmaDecompressAsync = lzmaDecompressAsync;
    function lzmaCompressAsync(text) {
        return getLzmaAsync()
            .then(lzma => new Promise((resolve, reject) => {
            try {
                lzma.compress(text, 7, (res, error) => {
                    if (error)
                        pxt.reportException(error);
                    resolve(error ? undefined : new Uint8Array(res));
                });
            }
            catch (e) {
                pxt.reportException(e);
                resolve(undefined);
            }
        }));
    }
    pxt.lzmaCompressAsync = lzmaCompressAsync;
})(pxt || (pxt = {}));
// preprocess C++ file to find functions exposed to pxt
(function (pxt) {
    var cpp;
    (function (cpp) {
        var U = pxtc.Util;
        let lf = U.lf;
        function parseExpr(e) {
            e = e.trim();
            e = e.replace(/^\(/, "");
            e = e.replace(/\)$/, "");
            e = e.trim();
            if (/^-/.test(e) && parseExpr(e.slice(1)) != null)
                return -parseExpr(e.slice(1));
            if (/^0x[0-9a-f]+$/i.exec(e))
                return parseInt(e.slice(2), 16);
            if (/^0b[01]+$/i.exec(e))
                return parseInt(e.slice(2), 2);
            if (/^0\d+$/i.exec(e))
                return parseInt(e, 8);
            if (/^\d+$/i.exec(e))
                return parseInt(e, 10);
            return null;
        }
        const vmKeepFunctions = {
            "pxt::mkAction": 1,
            "pxt::dumpPerfCounters": 1,
            "pxt::deepSleep": 1,
            "pxt::getConfig": 1,
            "pxtrt::mkMap": 1,
            "pxtrt::mapSet": 1,
            "pxtrt::stclo": 1,
            "pxtrt::mklocRef": 1,
            "pxtrt::stlocRef": 1,
            "pxtrt::ldlocRef": 1,
            "pxtrt::panic": 1,
        };
        function nsWriter(nskw = "namespace") {
            let text = "";
            let currNs = "";
            let setNs = (ns, over = "") => {
                if (currNs == ns)
                    return;
                if (currNs)
                    text += "}\n";
                if (ns)
                    text += over || (nskw + " " + ns + " {\n");
                currNs = ns;
            };
            let indent = "    ";
            return {
                setNs,
                clear: () => {
                    text = "";
                    currNs = "";
                },
                write: (s) => {
                    if (!s.trim())
                        text += "\n";
                    else {
                        s = s.trim()
                            .replace(/^\s*/mg, indent)
                            .replace(/^(\s*)\*/mg, (f, s) => s + " *");
                        text += s + "\n";
                    }
                },
                incrIndent: () => {
                    indent += "    ";
                },
                decrIndent: () => {
                    indent = indent.slice(4);
                },
                finish: () => {
                    setNs("");
                    return text;
                }
            };
        }
        cpp.nsWriter = nsWriter;
        function parseCppInt(v) {
            if (!v)
                return null;
            v = v.trim();
            let mm = /^\((.*)\)/.exec(v);
            if (mm)
                v = mm[1];
            if (/^-?(\d+|0[xX][0-9a-fA-F]+)$/.test(v))
                return parseInt(v);
            return null;
        }
        cpp.parseCppInt = parseCppInt;
        let prevExtInfos = {};
        class PkgConflictError extends Error {
            constructor(msg) {
                super(msg);
                this.isUserError = true;
                this.message = msg;
            }
        }
        cpp.PkgConflictError = PkgConflictError;
        function getExtensionInfo(mainPkg) {
            const pkgSnapshot = {
                "__appVariant": pxt.appTargetVariant || ""
            };
            const constsName = "dal.d.ts";
            let sourcePath = "/source/";
            let disabledDeps = "";
            let mainDeps = [];
            // order shouldn't matter for c++ compilation,
            // so use a stable order to prevent order changes from fetching a new hex file
            const mainPkgDeps = mainPkg.sortedDeps(true)
                .sort((a, b) => {
                if (a.id == "this")
                    return 1;
                else if (b.id == "this")
                    return -1;
                else
                    return U.strcmp(a.id, b.id);
            });
            for (let pkg of mainPkgDeps) {
                if (pkg.disablesVariant(pxt.appTargetVariant) ||
                    pkg.resolvedDependencies().some(d => d.disablesVariant(pxt.appTargetVariant))) {
                    if (disabledDeps)
                        disabledDeps += ", ";
                    disabledDeps += pkg.id;
                    pxt.debug(`disable variant ${pxt.appTargetVariant} due to ${pkg.id}`);
                    continue;
                }
                mainDeps.push(pkg);
                pkg.addSnapshot(pkgSnapshot, [constsName, ".h", ".cpp"]);
            }
            const key = JSON.stringify(pkgSnapshot);
            const prevInfo = prevExtInfos[key];
            if (prevInfo) {
                pxt.debug("Using cached extinfo");
                const r = U.flatClone(prevInfo);
                r.disabledDeps = disabledDeps;
                return r;
            }
            pxt.debug("Generating new extinfo");
            const res = pxtc.emptyExtInfo();
            res.disabledDeps = disabledDeps;
            let compileService = pxt.appTarget.compileService;
            if (!compileService)
                compileService = {
                    gittag: "none",
                    serviceId: "nocompile"
                };
            compileService = U.clone(compileService);
            let compile = mainPkg.getTargetOptions();
            if (!compile)
                compile = {
                    isNative: false,
                    hasHex: false,
                    switches: {}
                };
            const isPlatformio = !!compileService.platformioIni;
            const isCodal = compileService.buildEngine == "codal" || compileService.buildEngine == "dockercodal";
            const isDockerMake = compileService.buildEngine == "dockermake" || compileService.buildEngine == "dockercross";
            const isEspIdf = compileService.buildEngine == "dockerespidf";
            const isYotta = !isPlatformio && !isCodal && !isDockerMake && !isEspIdf;
            const isVM = compile.nativeType == pxtc.NATIVE_TYPE_VM;
            if (isPlatformio)
                sourcePath = "/src/";
            else if (isCodal || isDockerMake)
                sourcePath = "/pxtapp/";
            else if (isEspIdf)
                sourcePath = "/main/";
            let pxtConfig = "// Configuration defines\n";
            let pointersInc = "\nPXT_SHIMS_BEGIN\n";
            let pointerIncPre = "";
            let abiInc = "";
            let includesInc = `#include "pxt.h"\n`;
            let thisErrors = "";
            let dTsNamespace = "";
            let err = (s) => thisErrors += `   ${fileName}(${lineNo}): ${s}\n`;
            let lineNo = 0;
            let fileName = "";
            let protos = nsWriter("namespace");
            let shimsDTS = nsWriter("declare namespace");
            let enumsDTS = nsWriter("declare namespace");
            let allErrors = "";
            let knownEnums = {};
            let vmVisitedFunctions = {};
            const enumVals = {
                "true": "1",
                "false": "0",
                "null": "0",
                "NULL": "0",
            };
            // we sometimes append _ to C++ names to avoid name clashes
            function toJs(name) {
                return name.trim().replace(/[\_\*]$/, "");
            }
            for (const pkg of mainDeps) {
                if (pkg.getFiles().indexOf(constsName) >= 0) {
                    const src = pkg.host().readFile(pkg, constsName);
                    pxt.Util.assert(!!src, `${constsName} not found in ${pkg.id}`);
                    src.split(/\r?\n/).forEach(ln => {
                        let m = /^\s*(\w+) = (.*),/.exec(ln);
                        if (m) {
                            enumVals[m[1]] = m[2];
                        }
                    });
                }
                for (const fn of pkg.getFiles()) {
                    if (["Makefile", "sdkconfig.defaults", "CMakeLists.txt"].indexOf(fn) >= 0) {
                        res.generatedFiles["/" + fn] = pkg.host().readFile(pkg, fn);
                    }
                }
            }
            let hash_if_options = ["0", "false", "PXT_UTF8"];
            let cpp_options = {};
            if (compile.switches.boxDebug)
                cpp_options["PXT_BOX_DEBUG"] = 1;
            if (compile.utf8)
                cpp_options["PXT_UTF8"] = 1;
            if (compile.switches.profile)
                cpp_options["PXT_PROFILE"] = 1;
            if (compile.switches.gcDebug)
                cpp_options["PXT_GC_DEBUG"] = 1;
            if (compile.switches.numFloat)
                cpp_options["PXT_USE_FLOAT"] = 1;
            if (compile.nativeType == pxtc.NATIVE_TYPE_VM)
                cpp_options["PXT_VM"] = 1;
            function stripComments(ln) {
                return ln.replace(/\/\/.*/, "").replace(/\/\*/, "");
            }
            let enumVal = 0;
            let inEnum = false;
            let currNs = "";
            let currDocComment = "";
            let currAttrs = "";
            let inDocComment = false;
            function handleComments(ln) {
                if (inEnum)
                    return true;
                if (/^\s*\/\*\*/.test(ln)) {
                    inDocComment = true;
                    currDocComment = ln + "\n";
                    if (/\*\//.test(ln))
                        inDocComment = false;
                    return true;
                }
                if (inDocComment) {
                    currDocComment += ln + "\n";
                    if (/\*\//.test(ln)) {
                        inDocComment = false;
                    }
                    return true;
                }
                if (/^\s*\/\/%/.test(ln)) {
                    currAttrs += ln + "\n";
                    return true;
                }
                return false;
            }
            function enterEnum(cpname, brace) {
                inEnum = true;
                enumVal = -1;
                enumsDTS.write("");
                enumsDTS.write("");
                if (currAttrs || currDocComment) {
                    enumsDTS.write(currDocComment);
                    enumsDTS.write(currAttrs);
                    currAttrs = "";
                    currDocComment = "";
                }
                enumsDTS.write(`declare const enum ${toJs(cpname)} ${brace}`);
                knownEnums[cpname] = true;
            }
            function processEnumLine(ln) {
                let lnNC = stripComments(ln);
                if (inEnum && lnNC.indexOf("}") >= 0) {
                    inEnum = false;
                    enumsDTS.write("}");
                }
                if (!inEnum)
                    return;
                // parse the enum case, with lots of optional stuff (?)
                let mm = /^\s*(\w+)\s*(=\s*(.*?))?,?\s*$/.exec(lnNC);
                if (mm) {
                    let nm = mm[1];
                    let v = mm[3];
                    let opt = "";
                    if (v) {
                        // user-supplied value
                        v = v.trim();
                        let curr = U.lookup(enumVals, v);
                        if (curr != null) {
                            opt = "  // " + v;
                            v = curr;
                        }
                        enumVal = parseCppInt(v);
                        if (enumVal == null)
                            err("cannot determine value of " + lnNC);
                    }
                    else {
                        // no user-supplied value
                        enumVal++;
                        v = enumVal + "";
                    }
                    enumsDTS.write(`    ${toJs(nm)} = ${v},${opt}`);
                }
                else {
                    enumsDTS.write(ln);
                }
            }
            function finishNamespace() {
                shimsDTS.setNs("");
                shimsDTS.write("");
                shimsDTS.write("");
                if (currAttrs || currDocComment) {
                    shimsDTS.write(currDocComment);
                    shimsDTS.write(currAttrs);
                    currAttrs = "";
                    currDocComment = "";
                }
            }
            function parseArg(parsedAttrs, s) {
                s = s.trim();
                let m = /(.*)=\s*(-?\w+)$/.exec(s);
                let defl = "";
                let qm = "";
                if (m) {
                    defl = m[2];
                    qm = "?";
                    s = m[1].trim();
                }
                m = /^(.*?)(\w+)$/.exec(s);
                if (!m) {
                    err("invalid argument: " + s);
                    return {
                        name: "???",
                        type: "int"
                    };
                }
                let argName = m[2];
                if (parsedAttrs.paramDefl[argName]) {
                    defl = parsedAttrs.paramDefl[argName];
                    qm = "?";
                }
                let numVal = defl ? U.lookup(enumVals, defl) : null;
                if (numVal != null)
                    defl = numVal;
                if (defl) {
                    if (parseCppInt(defl) == null)
                        err("Invalid default value (non-integer): " + defl);
                    currAttrs += ` ${argName}.defl=${defl}`;
                }
                return {
                    name: argName + qm,
                    type: m[1]
                };
            }
            function parseCpp(src, isHeader) {
                currNs = "";
                currDocComment = "";
                currAttrs = "";
                inDocComment = false;
                let indexedInstanceAttrs;
                let indexedInstanceIdx = -1;
                // replace #if 0 .... #endif with newlines
                src = src.replace(/^(\s*#\s*if\s+(\w+)\s*$)([^]*?)(^\s*#\s*(elif|else|endif)\s*$)/mg, (f, _if, arg, middle, _endif) => hash_if_options.indexOf(arg) >= 0 && !cpp_options[arg] ?
                    _if + middle.replace(/[^\n]/g, "") + _endif : f);
                // special handling of C++ namespace that ends with Methods (e.g. FooMethods)
                // such a namespace will be converted into a TypeScript interface
                // this enables simple objects with methods to be defined. See, for example:
                // https://github.com/microsoft/pxt-microbit/blob/master/libs/core/buffer.cpp
                // within that namespace, the first parameter of each function should have
                // the type Foo
                function interfaceName() {
                    let n = currNs.replace(/Methods$/, "");
                    if (n == currNs)
                        return null;
                    return n;
                }
                lineNo = 0;
                // the C++ types we can map to TypeScript
                function mapType(tp) {
                    switch (tp.replace(/\s+/g, "")) {
                        case "void": return "void";
                        // TODO: need int16_t
                        case "int32_t":
                        case "int":
                            return "int32";
                        case "uint32_t":
                        case "unsigned":
                            return "uint32";
                        case "TNumber":
                        case "float":
                        case "double":
                            return "number";
                        case "uint16_t": return "uint16";
                        case "int16_t":
                        case "short": return "int16";
                        case "uint8_t":
                        case "byte": return "uint8";
                        case "int8_t":
                        case "sbyte": return "int8";
                        case "bool":
                            if (compile.shortPointers)
                                err("use 'boolean' not 'bool' on 8 bit targets");
                            return "boolean";
                        case "StringData*": return "string";
                        case "String": return "string";
                        case "ImageLiteral_": return "string";
                        case "ImageLiteral": return "string";
                        case "Action": return "() => void";
                        case "TValue": return "any";
                        default:
                            return toJs(tp);
                        //err("Don't know how to map type: " + tp)
                        //return "any"
                    }
                }
                function mapRunTimeType(tp) {
                    tp = tp.replace(/\s+/g, "");
                    switch (tp) {
                        case "int32_t":
                        case "uint32_t":
                        case "unsigned":
                        case "uint16_t":
                        case "int16_t":
                        case "short":
                        case "uint8_t":
                        case "byte":
                        case "int8_t":
                        case "sbyte":
                        case "int":
                        case "ramint_t":
                            return "I";
                        case "void": return "V";
                        case "float": return "F";
                        case "TNumber": return "N";
                        case "TValue": return "T";
                        case "bool": return "B";
                        case "double": return "D";
                        case "ImageLiteral_":
                            return "T";
                        case "String":
                            return "S";
                        default:
                            if (U.lookup(knownEnums, tp))
                                return "I";
                            return "_" + tp.replace(/[\*_]+$/, "");
                    }
                }
                function generateVMWrapper(fi, argTypes) {
                    if (argTypes[0] == "FiberContext*")
                        return "::" + fi.name; // no wrapper
                    let wrap = "_wrp_" + fi.name.replace(/:/g, "_");
                    if (vmVisitedFunctions[fi.name])
                        return wrap;
                    vmVisitedFunctions[fi.name] = true;
                    /*
                    void call_getConfig(FiberContext *ctx) {
                        int a0 = toInt(ctx->sp[0]);
                        int a1 = toInt(ctx->r0); // last argument in r0
                        int r = getConfig(a0, a1);
                        ctx->r0 = fromInt(r);
                        ctx->sp += 1;
                    }
                    */
                    pointerIncPre += `\nvoid ${wrap}(FiberContext *ctx) {\n`;
                    const numArgs = argTypes.length;
                    let refs = [];
                    let needsStackSave = false;
                    let allConvs = "";
                    for (let i = 0; i < numArgs; ++i) {
                        const ind = fi.argsFmt[i + 1];
                        const tp = argTypes[i];
                        let conv = ind == "I" ? "toInt" :
                            ind == "B" ? "numops::toBool" :
                                "";
                        const inp = i == numArgs - 1 ? "ctx->r0" : `ctx->sp[${numArgs - i - 2}]`;
                        let argPref = "";
                        switch (tp) {
                            case "TValue":
                            case "TNumber":
                                break;
                            case "Action":
                                conv = "asRefAction";
                                break;
                            case "String":
                                conv = "convertToString";
                                argPref = "ctx, ";
                                needsStackSave = true;
                                break;
                            default:
                                if (!conv)
                                    conv = "as" + tp.replace(/\*/g, "");
                                break;
                        }
                        allConvs += `  ${tp} a${i} = (${tp}) ${conv}(${argPref}${inp});\n`;
                        refs.push("a" + i);
                    }
                    if (needsStackSave)
                        pointerIncPre += "  auto prevSP = ctx->sp;\n";
                    pointerIncPre += allConvs;
                    if (needsStackSave)
                        pointerIncPre += "  if (panicCode) { ctx->sp = prevSP; return; }\n";
                    const call = `::${fi.name}(${refs.join(", ")})`;
                    if (fi.argsFmt[0] == "V") {
                        pointerIncPre += `  ${call};\n`;
                        pointerIncPre += `  ctx->r0 = NULL;\n`;
                    }
                    else if (fi.argsFmt[0] == "I") {
                        pointerIncPre += `  ctx->r0 = fromInt(${call});\n`;
                    }
                    else if (fi.argsFmt[0] == "B") {
                        pointerIncPre += `  ctx->r0 = fromBool(${call});\n`;
                    }
                    else {
                        pointerIncPre += `  ctx->r0 = (TValue)${call};\n`;
                    }
                    if (needsStackSave)
                        pointerIncPre += "  ctx->sp = prevSP;\n";
                    if (numArgs > 1)
                        pointerIncPre += `  ctx->sp += ${numArgs - 1};\n`;
                    pointerIncPre += `}\n`;
                    return wrap;
                }
                inEnum = false;
                enumVal = 0;
                enumsDTS.setNs("");
                shimsDTS.setNs("");
                src.split(/\r?\n/).forEach(ln => {
                    ++lineNo;
                    // remove comments (NC = no comments)
                    let lnNC = stripComments(ln);
                    processEnumLine(ln);
                    // "enum class" and "enum struct" is C++ syntax to force scoping of
                    // enum members
                    let enM = /^\s*enum\s+(|class\s+|struct\s+)(\w+)\s*({|$)/.exec(lnNC);
                    if (enM) {
                        enterEnum(enM[2], enM[3]);
                        if (!isHeader) {
                            protos.setNs(currNs);
                            protos.write(`enum ${enM[2]} : int;`);
                        }
                    }
                    if (handleComments(ln))
                        return;
                    if (/^typedef.*;\s*$/.test(ln)) {
                        protos.setNs(currNs);
                        protos.write(ln);
                    }
                    let m = /^\s*namespace\s+(\w+)/.exec(ln);
                    if (m) {
                        //if (currNs) err("more than one namespace declaration not supported")
                        currNs = m[1];
                        if (interfaceName()) {
                            finishNamespace();
                            let tpName = interfaceName();
                            shimsDTS.setNs(currNs, `declare interface ${tpName} {`);
                        }
                        else if (currAttrs || currDocComment) {
                            finishNamespace();
                            shimsDTS.setNs(toJs(currNs));
                            enumsDTS.setNs(toJs(currNs));
                        }
                        return;
                    }
                    m = /^PXT_ABI\((\w+)\)/.exec(ln);
                    if (m && !isVM) {
                        pointersInc += `PXT_FNPTR(::${m[1]}),\n`;
                        abiInc += `extern "C" void ${m[1]}();\n`;
                        res.functions.push({
                            name: m[1],
                            argsFmt: [],
                            value: 0
                        });
                    }
                    m = /^\s*PXT_EXPORT\(([:\&\w]+)\)/.exec(ln);
                    if (m) {
                        if (!res.vmPointers)
                            res.vmPointers = [];
                        res.vmPointers.push(m[1]);
                    }
                    m = /^#define\s+PXT_COMM_BASE\s+([0-9a-fx]+)/.exec(ln);
                    if (m)
                        res.commBase = parseInt(m[1]);
                    // function definition
                    m = /^\s*(\w+)([\*\&]*\s+[\*\&]*)(\w+)\s*\(([^\(\)]*)\)\s*(;\s*$|\{|$)/.exec(ln);
                    if (currAttrs && m) {
                        indexedInstanceAttrs = null;
                        let parsedAttrs = pxtc.parseCommentString(currAttrs);
                        // top-level functions (outside of a namespace) are not permitted
                        if (!currNs)
                            err("missing namespace declaration");
                        let retTp = (m[1] + m[2]).replace(/\s+/g, "");
                        let funName = m[3];
                        let origArgs = m[4];
                        currAttrs = currAttrs.trim().replace(/ \w+\.defl=\w+/g, "");
                        let argsFmt = [mapRunTimeType(retTp)];
                        let argTypes = [];
                        let args = origArgs.split(/,/).filter(s => !!s).map(s => {
                            let r = parseArg(parsedAttrs, s);
                            argsFmt.push(mapRunTimeType(r.type));
                            argTypes.push(r.type.replace(/ /g, ""));
                            return `${r.name}: ${mapType(r.type)}`;
                        });
                        let fi = {
                            name: currNs + "::" + funName,
                            argsFmt,
                            value: null
                        };
                        //console.log(`${ln.trim()} : ${argsFmt}`)
                        if (currDocComment) {
                            shimsDTS.setNs(toJs(currNs));
                            shimsDTS.write("");
                            shimsDTS.write(currDocComment);
                            if (/ImageLiteral/.test(m[4]) && !/imageLiteral=/.test(currAttrs))
                                currAttrs += ` imageLiteral=1`;
                            currAttrs += ` shim=${fi.name}`;
                            shimsDTS.write(currAttrs);
                            funName = toJs(funName);
                            if (interfaceName()) {
                                let tp0 = (args[0] || "").replace(/^.*:\s*/, "").trim();
                                if (tp0.toLowerCase() != interfaceName().toLowerCase()) {
                                    err(lf("Invalid first argument; should be of type '{0}', but is '{1}'", interfaceName(), tp0));
                                }
                                args.shift();
                                if (args.length == 0 && /\bproperty\b/.test(currAttrs))
                                    shimsDTS.write(`${funName}: ${mapType(retTp)};`);
                                else
                                    shimsDTS.write(`${funName}(${args.join(", ")}): ${mapType(retTp)};`);
                            }
                            else {
                                shimsDTS.write(`function ${funName}(${args.join(", ")}): ${mapType(retTp)};`);
                            }
                        }
                        currDocComment = "";
                        currAttrs = "";
                        if (!isHeader) {
                            protos.setNs(currNs);
                            protos.write(`${retTp} ${funName}(${origArgs});`);
                        }
                        res.functions.push(fi);
                        if (isYotta)
                            pointersInc += "(uint32_t)(void*)::" + fi.name + ",\n";
                        else if (isVM) {
                            if (U.startsWith(fi.name, "pxt::op_") ||
                                vmKeepFunctions[fi.name] ||
                                parsedAttrs.expose ||
                                (!U.startsWith(fi.name, "pxt::") && !U.startsWith(fi.name, "pxtrt::"))) {
                                const wrap = generateVMWrapper(fi, argTypes);
                                const nargs = fi.argsFmt.length - 1;
                                pointersInc += `{ "${fi.name}", (OpFun)(void*)${wrap}, ${nargs} },\n`;
                            }
                        }
                        else
                            pointersInc += "PXT_FNPTR(::" + fi.name + "),\n";
                        return;
                    }
                    m = /^\s*extern const (\w+) (\w+);/.exec(ln);
                    if (currAttrs && m) {
                        let fi = {
                            name: currNs + "::" + m[2],
                            argsFmt: [],
                            value: null
                        };
                        res.functions.push(fi);
                        if (!isVM)
                            pointersInc += "PXT_FNPTR(&::" + fi.name + "),\n";
                        currAttrs = "";
                        return;
                    }
                    m = /^\s*(\w+)\s+(\w+)\s*;/.exec(ln);
                    if (currAttrs && m) {
                        let parsedAttrs = pxtc.parseCommentString(currAttrs);
                        if (parsedAttrs.indexedInstanceNS) {
                            indexedInstanceAttrs = parsedAttrs;
                            shimsDTS.setNs(parsedAttrs.indexedInstanceNS);
                            indexedInstanceIdx = 0;
                        }
                        let tp = m[1];
                        let nm = m[2];
                        if (indexedInstanceAttrs) {
                            currAttrs = currAttrs.trim();
                            currAttrs += ` fixedInstance shim=${indexedInstanceAttrs.indexedInstanceShim}(${indexedInstanceIdx++})`;
                            shimsDTS.write("");
                            shimsDTS.write(currDocComment);
                            shimsDTS.write(currAttrs);
                            shimsDTS.write(`const ${nm}: ${mapType(tp)};`);
                            currDocComment = "";
                            currAttrs = "";
                            return;
                        }
                    }
                    if (currAttrs && ln.trim()) {
                        err("declaration not understood: " + ln);
                        currAttrs = "";
                        currDocComment = "";
                        return;
                    }
                });
            }
            const currSettings = U.clone(compileService.yottaConfig || {});
            const optSettings = {};
            const settingSrc = {};
            const codalLibraries = {};
            function parseJson(pkg) {
                const j0 = pkg.config.platformio;
                if (j0 && j0.dependencies) {
                    U.jsonCopyFrom(res.platformio.dependencies, j0.dependencies);
                }
                if (res.npmDependencies && pkg.config.npmDependencies)
                    U.jsonCopyFrom(res.npmDependencies, pkg.config.npmDependencies);
                const codal = pkg.config.codal;
                if (isCodal && codal) {
                    for (const lib of codal.libraries || []) {
                        const repo = pxt.github.parseRepoId(lib);
                        if (!repo)
                            U.userError(lf("codal library {0} doesn't look like github repo", lib));
                        const canonical = pxt.github.stringifyRepo(repo);
                        const existing = U.lookup(codalLibraries, repo.project);
                        if (existing) {
                            if (pxt.github.stringifyRepo(existing) != canonical)
                                U.userError(lf("conflict between codal libraries: {0} and {1}", pxt.github.stringifyRepo(existing), canonical));
                        }
                        else {
                            codalLibraries[repo.project] = repo;
                        }
                    }
                }
                const json = pkg.config.yotta;
                if (!json)
                    return;
                // TODO check for conflicts
                if (json.dependencies) {
                    U.jsonCopyFrom(res.yotta.dependencies, json.dependencies);
                }
                if (json.config) {
                    const cfg = U.jsonFlatten(json.config);
                    for (const settingName of Object.keys(cfg)) {
                        const prev = U.lookup(settingSrc, settingName);
                        const settingValue = cfg[settingName];
                        if (!prev || prev.config.yotta.configIsJustDefaults) {
                            settingSrc[settingName] = pkg;
                            currSettings[settingName] = settingValue;
                        }
                        else if (currSettings[settingName] === settingValue) {
                            // OK
                        }
                        else if (!pkg.parent.config.yotta || !pkg.parent.config.yotta.ignoreConflicts) {
                            let err = new PkgConflictError(lf("conflict on yotta setting {0} between extensions {1} and {2}", settingName, pkg.id, prev.id));
                            err.pkg0 = prev;
                            err.pkg1 = pkg;
                            err.settingName = settingName;
                            throw err;
                        }
                    }
                }
                if (json.optionalConfig) {
                    const cfg = U.jsonFlatten(json.optionalConfig);
                    for (const settingName of Object.keys(cfg)) {
                        const settingValue = cfg[settingName];
                        // last one wins
                        optSettings[settingName] = settingValue;
                    }
                }
            }
            // This is overridden on the build server, but we need it for command line build
            if (isYotta && compile.hasHex) {
                let cs = compileService;
                U.assert(!!cs.yottaCorePackage);
                U.assert(!!cs.githubCorePackage);
                U.assert(!!cs.gittag);
                let tagged = cs.githubCorePackage + "#" + compileService.gittag;
                res.yotta.dependencies[cs.yottaCorePackage] = tagged;
            }
            if (mainPkg) {
                let seenMain = false;
                for (let pkg of mainDeps) {
                    thisErrors = "";
                    parseJson(pkg);
                    if (pkg == mainPkg) {
                        seenMain = true;
                        // we only want the main package in generated .d.ts
                        shimsDTS.clear();
                        enumsDTS.clear();
                    }
                    else {
                        U.assert(!seenMain);
                    }
                    // Generally, headers need to be processed before sources, as they contain definitions
                    // (in particular of enums, which are needed to decide if we're doing conversions for
                    // function arguments). This can still fail if one header uses another and they are
                    // listed in invalid order...
                    const isHeaderFn = (fn) => U.endsWith(fn, ".h");
                    const ext = ".cpp";
                    const files = pkg.getFiles().filter(isHeaderFn)
                        .concat(pkg.getFiles().filter(s => !isHeaderFn(s)));
                    for (let fn of files) {
                        const isHeader = isHeaderFn(fn);
                        if (isHeader || U.endsWith(fn, ext)) {
                            let fullName = pkg.config.name + "/" + fn;
                            if ((pkg.config.name == "base" || /^core($|---)/.test(pkg.config.name)) && isHeader)
                                fullName = fn;
                            if (isHeader)
                                includesInc += `#include "${isYotta ? sourcePath.slice(1) : ""}${fullName}"\n`;
                            let src = pkg.readFile(fn);
                            if (src == null)
                                U.userError(lf("C++ file {0} is missing in extension {1}.", fn, pkg.config.name));
                            fileName = fullName;
                            parseCpp(src, isHeader);
                            // src = src.replace(/^[ \t]*/mg, "") // HACK: shrink the files
                            res.extensionFiles[sourcePath + fullName] = src;
                            if (pkg.level == 0)
                                res.onlyPublic = false;
                            if (pkg.verProtocol() && pkg.verProtocol() != "pub" && pkg.verProtocol() != "embed")
                                res.onlyPublic = false;
                        }
                        if (U.endsWith(fn, ".c") || U.endsWith(fn, ".S") || U.endsWith(fn, ".s")) {
                            let src = pkg.readFile(fn);
                            res.extensionFiles[sourcePath + pkg.config.name + "/" + fn.replace(/\.S$/, ".s")] = src;
                        }
                    }
                    if (thisErrors) {
                        allErrors += lf("Extension {0}:\n", pkg.id) + thisErrors;
                    }
                }
                if (!seenMain) {
                    // this can happen if the main package is disabled in current variant
                    shimsDTS.clear();
                    enumsDTS.clear();
                }
            }
            if (allErrors)
                U.userError(allErrors);
            // merge optional settings
            U.jsonCopyFrom(optSettings, currSettings);
            U.iterMap(optSettings, (k, v) => {
                if (v === null) {
                    delete optSettings[k];
                }
            });
            // fix keys - ==> _
            Object.keys(optSettings)
                .filter(k => /-/.test(k)).forEach(k => {
                const v = optSettings[k];
                delete optSettings[k];
                optSettings[k.replace(/-/g, '_')] = v;
            });
            if (!isYotta && compileService.yottaConfigCompatibility) { // yotta automatically adds YOTTA_CFG_
                Object.keys(optSettings)
                    .forEach(k => optSettings["YOTTA_CFG_" + k] = optSettings[k]);
            }
            optSettings["PXT_TARGET"] = JSON.stringify(pxt.appTarget.id);
            function allFilesWithExt(ext) {
                let allfiles = Object.keys(res.extensionFiles).concat(Object.keys(res.generatedFiles));
                return allfiles.filter(f => U.endsWith(f, ext)).map(s => s.slice(1));
            }
            const configJson = U.jsonUnFlatten(optSettings);
            if (isDockerMake) {
                let packageJson = {
                    name: "pxt-app",
                    private: true,
                    dependencies: res.npmDependencies,
                };
                res.generatedFiles["/package.json"] = JSON.stringify(packageJson, null, 4) + "\n";
            }
            else if (isEspIdf) {
                const files = U.concatArrayLike([
                    allFilesWithExt(".c"),
                    allFilesWithExt(".cpp"),
                    allFilesWithExt(".s")
                ]).map(s => s.slice(sourcePath.length - 1)).concat(["main.cpp"]);
                files.push("pointers.cpp");
                res.generatedFiles[sourcePath + "CMakeLists.txt"] =
                    `idf_component_register(\n  SRCS\n` +
                        files.map(f => `    "${f}"\n`).join("") +
                        `  INCLUDE_DIRS\n    "."\n)\n`;
            }
            else if (isCodal) {
                let cs = compileService;
                let cfg = U.clone(cs.codalDefinitions) || {};
                let trg = cs.codalTarget;
                if (typeof trg == "string")
                    trg = trg + ".json";
                let codalJson = {
                    "target": trg,
                    "definitions": cfg,
                    "config": cfg,
                    "application": "pxtapp",
                    "output_folder": "build",
                    // include these, because we use hash of this file to see if anything changed
                    "pxt_gitrepo": cs.githubCorePackage,
                    "pxt_gittag": cs.gittag,
                    "libraries": U.values(codalLibraries).map(r => ({
                        "name": r.project,
                        "url": "https://github.com/" + r.fullName,
                        "branch": r.tag || "master",
                        "type": "git"
                    }))
                };
                if (codalJson.libraries.length == 0)
                    delete codalJson.libraries;
                U.iterMap(U.jsonFlatten(configJson), (k, v) => {
                    k = k.replace(/^codal\./, "device.").toUpperCase().replace(/\./g, "_");
                    cfg[k] = v;
                });
                res.generatedFiles["/codal.json"] = JSON.stringify(codalJson, null, 4) + "\n";
                pxt.debug(`codal.json: ${res.generatedFiles["/codal.json"]}`);
            }
            else if (isPlatformio) {
                const iniLines = compileService.platformioIni.slice();
                // TODO merge configjson
                iniLines.push("lib_deps =");
                U.iterMap(res.platformio.dependencies, (pkg, ver) => {
                    let pkgSpec = /[@#\/]/.test(ver) ? ver : pkg + "@" + ver;
                    iniLines.push("  " + pkgSpec);
                });
                res.generatedFiles["/platformio.ini"] = iniLines.join("\n") + "\n";
            }
            else {
                res.yotta.config = configJson;
                let name = "pxt-app";
                if (compileService.yottaBinary)
                    name = compileService.yottaBinary.replace(/-combined/, "").replace(/\.hex$/, "");
                let moduleJson = {
                    "name": name,
                    "version": "0.0.0",
                    "description": "Auto-generated. Do not edit.",
                    "license": "n/a",
                    "dependencies": res.yotta.dependencies,
                    "targetDependencies": {},
                    "bin": "./source"
                };
                res.generatedFiles["/module.json"] = JSON.stringify(moduleJson, null, 4) + "\n";
                pxt.debug(`module.json: ${res.generatedFiles["/module.json"]}`);
            }
            for (let k of Object.keys(cpp_options)) {
                pxtConfig += `#define ${k} ${cpp_options[k]}\n`;
            }
            if (compile.uf2Family)
                pxtConfig += `#define PXT_UF2_FAMILY ${compile.uf2Family}\n`;
            res.generatedFiles[sourcePath + "pointers.cpp"] = includesInc + protos.finish() + abiInc +
                pointerIncPre + pointersInc + "\nPXT_SHIMS_END\n";
            res.generatedFiles[sourcePath + "pxtconfig.h"] = pxtConfig;
            pxt.debug(`pxtconfig.h: ${res.generatedFiles[sourcePath + "pxtconfig.h"]}`);
            if (isYotta) {
                res.generatedFiles["/config.json"] = JSON.stringify(configJson, null, 4) + "\n";
                pxt.debug(`yotta config.json: ${res.generatedFiles["/config.json"]}`);
            }
            res.generatedFiles[sourcePath + "main.cpp"] = `
#include "pxt.h"
#ifdef PXT_MAIN
PXT_MAIN
#else
int main() {
    uBit.init();
    pxt::start();
    release_fiber();
    return 0;   // your program will never reach this line.
}
#endif
`;
            if (res.generatedFiles["/Makefile"]) {
                let inc = "";
                let add = (name, ext) => {
                    inc += `${name} = ${allFilesWithExt(ext).join(" ")}\n`;
                };
                add("PXT_C", ".c");
                add("PXT_CPP", ".cpp");
                add("PXT_S", ".s");
                add("PXT_HEADERS", ".h");
                inc += "PXT_SOURCES := $(PXT_C) $(PXT_S) $(PXT_CPP)\n";
                inc += "PXT_OBJS := $(addprefix bld/, $(PXT_C:.c=.o) $(PXT_S:.s=.o) $(PXT_CPP:.cpp=.o))\n";
                res.generatedFiles["/Makefile.inc"] = inc;
            }
            res.generatedFiles["/functions.json"] = JSON.stringify(res.functions, null, 1);
            let tmp = res.extensionFiles;
            U.jsonCopyFrom(tmp, res.generatedFiles);
            let creq = {
                config: compileService.serviceId,
                tag: compileService.gittag,
                replaceFiles: tmp,
                dependencies: (isYotta ? res.yotta.dependencies : null)
            };
            let data = JSON.stringify(creq);
            res.sha = U.sha256(data);
            res.skipCloudBuild = !!compileService.skipCloudBuild;
            res.compileData = ts.pxtc.encodeBase64(U.toUTF8(data));
            res.shimsDTS = shimsDTS.finish();
            res.enumsDTS = enumsDTS.finish();
            if (Object.keys(prevExtInfos).length > 10)
                prevExtInfos = {};
            prevExtInfos[key] = res;
            return res;
        }
        cpp.getExtensionInfo = getExtensionInfo;
        function fromUTF8Bytes(binstr) {
            if (!binstr)
                return "";
            // escape function is deprecated
            let escaped = "";
            for (let i = 0; i < binstr.length; ++i) {
                let k = binstr[i] & 0xff;
                if (k == 37 || k > 0x7f) {
                    escaped += "%" + k.toString(16);
                }
                else {
                    escaped += String.fromCharCode(k);
                }
            }
            // decodeURIComponent does the actual UTF8 decoding
            return decodeURIComponent(escaped);
        }
        function swapBytes(str) {
            let r = "";
            let i = 0;
            for (; i < str.length; i += 2)
                r = str[i] + str[i + 1] + r;
            pxt.Util.assert(i == str.length);
            return r;
        }
        function extractSourceFromBin(bin) {
            let magic = [0x41, 0x14, 0x0E, 0x2F, 0xB8, 0x2F, 0xA2, 0xBB];
            outer: for (let p = 0; p < bin.length; p += 16) {
                if (bin[p] != magic[0])
                    continue;
                for (let i = 0; i < magic.length; ++i)
                    if (bin[p + i] != magic[i])
                        continue outer;
                let metaLen = bin[p + 8] | (bin[p + 9] << 8);
                let textLen = bin[p + 10] | (bin[p + 11] << 8) | (bin[p + 12] << 16) | (bin[p + 13] << 24);
                // TODO test in iOS Safari
                p += 16;
                let end = p + metaLen + textLen;
                if (end > bin.length)
                    continue;
                let bufmeta = bin.slice(p, p + metaLen);
                let buftext = bin.slice(p + metaLen, end);
                return {
                    meta: fromUTF8Bytes(bufmeta),
                    text: buftext
                };
            }
            return null;
        }
        function extractSource(hexfile) {
            if (!hexfile)
                return undefined;
            let metaLen = 0;
            let textLen = 0;
            let toGo = 0;
            let buf;
            let ptr = 0;
            hexfile.split(/\r?\n/).forEach(ln => {
                let m = /^:10....0[0E]41140E2FB82FA2BB(....)(....)(....)(....)(..)/.exec(ln);
                if (m) {
                    metaLen = parseInt(swapBytes(m[1]), 16);
                    textLen = parseInt(swapBytes(m[2]), 16);
                    toGo = metaLen + textLen;
                    buf = new Uint8Array(toGo);
                }
                else if (toGo > 0) {
                    m = /^:10....0[0E](.*)(..)$/.exec(ln);
                    if (!m)
                        return;
                    let k = m[1];
                    while (toGo > 0 && k.length > 0) {
                        buf[ptr++] = parseInt(k[0] + k[1], 16);
                        k = k.slice(2);
                        toGo--;
                    }
                }
            });
            if (!buf || !(toGo == 0 && ptr == buf.length)) {
                return undefined;
            }
            let bufmeta = new Uint8Array(metaLen);
            let buftext = new Uint8Array(textLen);
            for (let i = 0; i < metaLen; ++i)
                bufmeta[i] = buf[i];
            for (let i = 0; i < textLen; ++i)
                buftext[i] = buf[metaLen + i];
            // iOS Safari doesn't seem to have slice() on Uint8Array
            return {
                meta: fromUTF8Bytes(bufmeta),
                text: buftext
            };
        }
        function unpackSourceFromHexFileAsync(file) {
            if (!file)
                return undefined;
            return pxt.Util.fileReadAsBufferAsync(file).then(data => {
                let a = new Uint8Array(data);
                return unpackSourceFromHexAsync(a);
            });
        }
        cpp.unpackSourceFromHexFileAsync = unpackSourceFromHexFileAsync;
        function unpackSourceFromHexAsync(dat) {
            function error(e) {
                pxt.debug(e);
                return Promise.reject(new Error(e));
            }
            let rawEmbed;
            // UF2?
            if (pxt.HF2.read32(dat, 0) == ts.pxtc.UF2.UF2_MAGIC_START0) {
                let bin = ts.pxtc.UF2.toBin(dat);
                if (bin)
                    rawEmbed = extractSourceFromBin(bin.buf);
            }
            // ELF?
            if (pxt.HF2.read32(dat, 0) == 0x464c457f) {
                rawEmbed = extractSourceFromBin(dat);
            }
            // HEX? (check for colon)
            if (dat[0] == 0x3a) {
                let str = fromUTF8Bytes(dat);
                rawEmbed = extractSource(str || "");
            }
            if (!rawEmbed || !rawEmbed.meta || !rawEmbed.text) {
                return error("This .hex file doesn't contain source.");
            }
            let hd = JSON.parse(rawEmbed.meta);
            if (!hd) {
                return error("This .hex file is not valid.");
            }
            else if (hd.compression == "LZMA") {
                return pxt.lzmaDecompressAsync(rawEmbed.text)
                    .then(res => {
                    if (!res)
                        return null;
                    let meta = res.slice(0, hd.headerSize || hd.metaSize || 0);
                    let text = res.slice(meta.length);
                    if (meta)
                        pxt.Util.jsonCopyFrom(hd, JSON.parse(meta));
                    return { meta: hd, source: text };
                });
            }
            else if (hd.compression) {
                return error(`Compression type ${hd.compression} not supported.`);
            }
            else {
                return Promise.resolve({ source: fromUTF8Bytes(rawEmbed.text) });
            }
        }
        cpp.unpackSourceFromHexAsync = unpackSourceFromHexAsync;
    })(cpp = pxt.cpp || (pxt.cpp = {}));
})(pxt || (pxt = {}));
(function (pxt) {
    var hexloader;
    (function (hexloader) {
        const downloadCache = {};
        let cdnUrlPromise;
        let hexInfoMemCache = {};
        hexloader.showLoading = (msg) => { };
        hexloader.hideLoading = () => { };
        function downloadHexInfoAsync(extInfo) {
            if (!downloadCache.hasOwnProperty(extInfo.sha))
                downloadCache[extInfo.sha] = downloadHexInfoCoreAsync(extInfo);
            return downloadCache[extInfo.sha];
        }
        function getCdnUrlAsync() {
            if (cdnUrlPromise)
                return cdnUrlPromise;
            else {
                let curr = pxt.getOnlineCdnUrl();
                if (curr)
                    return (cdnUrlPromise = Promise.resolve(curr));
                const forceLive = pxt.webConfig && pxt.webConfig.isStatic;
                return (cdnUrlPromise = pxt.Cloud.privateGetAsync("clientconfig", forceLive)
                    .then(r => r.primaryCdnUrl));
            }
        }
        function downloadHexInfoCoreAsync(extInfo) {
            let hexurl = "";
            hexloader.showLoading(pxt.U.lf("Compiling (this may take a minute)..."));
            pxt.tickEvent("cppcompile.start");
            return downloadHexInfoLocalAsync(extInfo)
                .then((hex) => {
                if (hex) {
                    // Found the hex image in the local server cache, use that
                    pxt.tickEvent("cppcompile.cachehit");
                    return hex;
                }
                return getCdnUrlAsync()
                    .then(url => {
                    hexurl = url + "/compile/" + extInfo.sha;
                    return pxt.U.httpGetTextAsync(hexurl + ".hex");
                })
                    .then(r => r, e => pxt.Cloud.privatePostAsync("compile/extension", { data: extInfo.compileData }, true)
                    .then(ret => new Promise((resolve, reject) => {
                    let retry = 0;
                    const delay = 8000; // ms
                    const maxWait = 120000; // ms
                    const startTry = pxt.U.now();
                    const tryGet = () => {
                        retry++;
                        if (pxt.U.now() - startTry > maxWait) {
                            pxt.log(`abandoning C++ build`);
                            pxt.tickEvent("cppcompile.cancel", { retry });
                            resolve(null);
                            return null;
                        }
                        let url = ret.hex.replace(/\.hex/, ".json");
                        pxt.log(`polling C++ build ${url} (attempt #${retry})`);
                        pxt.tickEvent("cppcompile.poll", { retry });
                        return pxt.Util.httpGetJsonAsync(url)
                            .then(json => {
                            pxt.log(`build log ${url.replace(/\.json$/, ".log")}`);
                            pxt.tickEvent("cppcompile.done", {
                                success: (json === null || json === void 0 ? void 0 : json.success) ? 1 : 0,
                                retry,
                                duration: pxt.U.now() - startTry
                            });
                            if (!json.success) {
                                pxt.log(`build failed`);
                                if (json.mbedresponse && json.mbedresponse.result && json.mbedresponse.result.exception)
                                    pxt.log(json.mbedresponse.result.exception);
                                resolve(null);
                            }
                            else {
                                pxt.log("fetching " + hexurl + ".hex");
                                resolve(pxt.U.httpGetTextAsync(hexurl + ".hex"));
                            }
                        }, e => {
                            pxt.log(`waiting ${(delay / 1000) | 0}s for C++ build...`);
                            setTimeout(tryGet, delay);
                            return null;
                        });
                    };
                    tryGet();
                })))
                    .then(text => {
                    hexloader.hideLoading();
                    return {
                        hex: text && text.split(/\r?\n/)
                    };
                });
            }).finally(() => {
                hexloader.hideLoading();
            });
        }
        function downloadHexInfoLocalAsync(extInfo) {
            if (extInfo.skipCloudBuild)
                return Promise.resolve({ hex: ["SKIP"] });
            if (pxt.webConfig && pxt.webConfig.isStatic) {
                return pxt.Util.requestAsync({
                    url: `${pxt.webConfig.cdnUrl}hexcache/${extInfo.sha}.hex`
                })
                    .then((resp) => {
                    if (resp.text) {
                        const result = {
                            enums: [],
                            functions: [],
                            hex: resp.text.split(/\r?\n/)
                        };
                        return Promise.resolve(result);
                    }
                    pxt.log("Hex info not found in bundled hex cache");
                    return Promise.resolve();
                })
                    .catch((e) => {
                    pxt.log("Error fetching hex info from bundled hex cache");
                    return Promise.resolve();
                });
            }
            if (!pxt.Cloud.localToken || !window || !pxt.BrowserUtils.isLocalHost()) {
                return Promise.resolve(undefined);
            }
            return apiAsync("compile/" + extInfo.sha)
                .then((json) => {
                if (!json || json.notInOfflineCache || !json.hex) {
                    return Promise.resolve(undefined);
                }
                json.hex = json.hex.split(/\r?\n/);
                return json;
            })
                .catch((e) => {
                return Promise.resolve(undefined);
            });
        }
        function apiAsync(path, data) {
            return pxt.Cloud.localRequestAsync(path, data).then(r => r.json);
        }
        function storeWithLimitAsync(host, idxkey, newkey, newval, maxLen = 10) {
            return host.cacheStoreAsync(newkey, newval)
                .then(() => host.cacheGetAsync(idxkey))
                .then(res => {
                let keys;
                try {
                    keys = JSON.parse(res || "[]");
                }
                catch (e) {
                    // cache entry is corrupted, clear cache so that it gets rebuilt
                    console.error('invalid cache entry, clearing entry');
                    keys = [];
                }
                keys = keys.filter(k => k != newkey);
                keys.unshift(newkey);
                let todel = keys.slice(maxLen);
                keys = keys.slice(0, maxLen);
                return pxt.U.promiseMapAll(todel, e => host.cacheStoreAsync(e, "[]"))
                    .then(() => host.cacheStoreAsync(idxkey, JSON.stringify(keys)));
            });
        }
        hexloader.storeWithLimitAsync = storeWithLimitAsync;
        function recordGetAsync(host, idxkey, newkey) {
            return host.cacheGetAsync(idxkey)
                .then(res => {
                let keys;
                try {
                    keys = JSON.parse(res || "[]");
                }
                catch (e) {
                    // cache entry is corrupted, clear cache so that it gets rebuilt
                    console.error('invalid cache entry, clearing entry');
                    return host.cacheStoreAsync(idxkey, "[]");
                }
                if (keys[0] != newkey) {
                    keys = keys.filter(k => k != newkey);
                    keys.unshift(newkey);
                    return host.cacheStoreAsync(idxkey, JSON.stringify(keys));
                }
                else {
                    return null;
                }
            });
        }
        hexloader.recordGetAsync = recordGetAsync;
        function getHexInfoAsync(host, extInfo, cloudModule) {
            if (!extInfo.sha)
                return Promise.resolve(null);
            const cached = hexInfoMemCache[extInfo.sha];
            if (cached)
                return Promise.resolve(cached);
            pxt.debug("get hex info: " + extInfo.sha);
            let key = "hex-" + extInfo.sha;
            return host.cacheGetAsync(key)
                .then(res => {
                let cachedMeta;
                try {
                    cachedMeta = res ? JSON.parse(res) : null;
                }
                catch (e) {
                    // cache entry is corrupted, clear cache so that it gets rebuilt
                    console.log('invalid cache entry, clearing entry');
                    cachedMeta = null;
                }
                if (cachedMeta && cachedMeta.hex) {
                    pxt.debug("cache hit, size=" + res.length);
                    cachedMeta.hex = decompressHex(cachedMeta.hex);
                    return recordGetAsync(host, "hex-keys", key)
                        .then(() => cachedMeta);
                }
                else {
                    return downloadHexInfoAsync(extInfo)
                        .then(meta => {
                        let origHex = meta.hex;
                        meta.hex = compressHex(meta.hex);
                        let store = JSON.stringify(meta);
                        meta.hex = origHex;
                        return storeWithLimitAsync(host, "hex-keys", key, store)
                            .then(() => meta);
                    }).catch(e => {
                        pxt.reportException(e, { sha: extInfo.sha });
                        return Promise.resolve(null);
                    });
                }
            })
                .then(res => {
                if (res) {
                    if (Object.keys(hexInfoMemCache).length > 20)
                        hexInfoMemCache = {};
                    hexInfoMemCache[extInfo.sha] = res;
                }
                return res;
            });
        }
        hexloader.getHexInfoAsync = getHexInfoAsync;
        function decompressHex(hex) {
            let outp = [];
            for (let i = 0; i < hex.length; i++) {
                let m = /^([@!])(....)$/.exec(hex[i]);
                if (!m) {
                    outp.push(hex[i]);
                    continue;
                }
                let addr = parseInt(m[2], 16);
                let nxt = hex[++i];
                let buf = "";
                if (m[1] == "@") {
                    buf = "";
                    let cnt = parseInt(nxt, 16);
                    while (cnt-- > 0) {
                        /* eslint-disable no-octal */
                        buf += "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";
                        /* eslint-enable no-octal */
                    }
                }
                else {
                    buf = ts.pxtc.decodeBase64(nxt);
                }
                pxt.Util.assert(buf.length > 0);
                pxt.Util.assert(buf.length % 16 == 0);
                for (let j = 0; j < buf.length;) {
                    let bytes = [0x10, (addr >> 8) & 0xff, addr & 0xff, 0];
                    addr += 16;
                    for (let k = 0; k < 16; ++k) {
                        bytes.push(buf.charCodeAt(j++));
                    }
                    let chk = 0;
                    for (let k = 0; k < bytes.length; ++k)
                        chk += bytes[k];
                    bytes.push((-chk) & 0xff);
                    let r = ":";
                    for (let k = 0; k < bytes.length; ++k) {
                        let b = bytes[k] & 0xff;
                        if (b <= 0xf)
                            r += "0";
                        r += b.toString(16);
                    }
                    outp.push(r.toUpperCase());
                }
            }
            return outp;
        }
        function compressHex(hex) {
            let outp = [];
            let j = 0;
            for (let i = 0; i < hex.length; i += j) {
                let addr = -1;
                let outln = "";
                j = 0;
                let zeroMode = false;
                while (j < 500) {
                    let m = /^:10(....)00(.{32})(..)$/.exec(hex[i + j]);
                    if (!m)
                        break;
                    let h = m[2];
                    let isZero = /^0+$/.test(h);
                    let newaddr = parseInt(m[1], 16);
                    if (addr == -1) {
                        zeroMode = isZero;
                        outp.push((zeroMode ? "@" : "!") + m[1]);
                        addr = newaddr - 16;
                    }
                    else {
                        if (isZero != zeroMode)
                            break;
                        if (addr + 16 != newaddr)
                            break;
                    }
                    if (!zeroMode)
                        outln += h;
                    addr = newaddr;
                    j++;
                }
                if (j == 0) {
                    outp.push(hex[i]);
                    j = 1;
                }
                else {
                    if (zeroMode) {
                        outp.push(j.toString(16));
                    }
                    else {
                        let bin = "";
                        for (let k = 0; k < outln.length; k += 2)
                            bin += String.fromCharCode(parseInt(outln.slice(k, k + 2), 16));
                        outp.push(ts.pxtc.encodeBase64(bin));
                    }
                }
            }
            return outp;
        }
    })(hexloader = pxt.hexloader || (pxt.hexloader = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var crowdin;
    (function (crowdin) {
        crowdin.KEY_VARIABLE = "CROWDIN_KEY";
        crowdin.testMode = false;
        crowdin.TEST_KEY = "!!!testmode!!!";
        function setTestMode() {
            pxt.crowdin.testMode = true;
            pxt.log(`CROWDIN TEST MODE - files will NOT be uploaded`);
        }
        crowdin.setTestMode = setTestMode;
        function multipartPostAsync(key, uri, data = {}, filename = null, filecontents = null) {
            if (crowdin.testMode || key == crowdin.TEST_KEY) {
                const resp = {
                    success: true
                };
                return Promise.resolve({ statusCode: 200, headers: {}, text: JSON.stringify(resp), json: resp });
            }
            return pxt.Util.multipartPostAsync(uri, data, filename, filecontents);
        }
        function apiUri(branch, prj, key, cmd, args) {
            pxt.Util.assert(!!prj && !!key && !!cmd);
            const apiRoot = "https://api.crowdin.com/api/project/" + prj + "/";
            args = args || {};
            if (crowdin.testMode)
                delete args["key"]; // ensure no key is passed in test mode
            else
                args["key"] = key;
            if (branch)
                args["branch"] = branch;
            return apiRoot + cmd + "?" + Object.keys(args).map(k => `${k}=${encodeURIComponent(args[k])}`).join("&");
        }
        function downloadTranslationsAsync(branch, prj, key, filename, options = {}) {
            const q = { json: "true" };
            const infoUri = apiUri(branch, prj, key, "info", q);
            const r = {};
            filename = normalizeFileName(filename);
            return pxt.Util.httpGetTextAsync(infoUri).then(respText => {
                const info = JSON.parse(respText);
                if (!info)
                    throw new Error("info failed");
                let todo = info.languages.filter(l => l.code != "en");
                if (pxt.appTarget && pxt.appTarget.appTheme && pxt.appTarget.appTheme.availableLocales)
                    todo = todo.filter(l => pxt.appTarget.appTheme.availableLocales.indexOf(l.code) > -1);
                pxt.log('languages: ' + todo.map(l => l.code).join(', '));
                const nextFile = () => {
                    const item = todo.pop();
                    if (!item)
                        return Promise.resolve();
                    const exportFileUri = apiUri(branch, prj, key, "export-file", {
                        file: filename,
                        language: item.code,
                        export_translated_only: options.translatedOnly ? "1" : "0",
                        export_approved_only: options.validatedOnly ? "1" : "0"
                    });
                    pxt.log(`downloading ${item.name} - ${item.code} (${todo.length} more)`);
                    return pxt.Util.httpGetTextAsync(exportFileUri).then((transationsText) => {
                        try {
                            const translations = JSON.parse(transationsText);
                            if (translations)
                                r[item.code] = translations;
                        }
                        catch (e) {
                            pxt.log(exportFileUri + ' ' + e);
                        }
                        return nextFile();
                    }).then(() => pxt.Util.delay(1000)); // throttling otherwise crowdin fails
                };
                return nextFile();
            }).then(() => r);
        }
        crowdin.downloadTranslationsAsync = downloadTranslationsAsync;
        function mkIncr(filename) {
            let cnt = 0;
            return function incr() {
                if (cnt++ > 10) {
                    throw new Error("Too many API calls for " + filename);
                }
            };
        }
        function createDirectoryAsync(branch, prj, key, name, incr) {
            name = normalizeFileName(name);
            pxt.debug(`create directory ${branch || ""}/${name}`);
            if (!incr)
                incr = mkIncr(name);
            return multipartPostAsync(key, apiUri(branch, prj, key, "add-directory"), { json: "true", name: name })
                .then(resp => {
                pxt.debug(`crowdin resp: ${resp.statusCode}`);
                // 400 returned by folder already exists
                if (resp.statusCode == 200 || resp.statusCode == 400)
                    return Promise.resolve();
                if (resp.statusCode == 500 && resp.text) {
                    const json = JSON.parse(resp.text);
                    if (json.error.code === 50) {
                        pxt.log('directory already exists');
                        return Promise.resolve();
                    }
                }
                const data = resp.json || JSON.parse(resp.text) || { error: {} };
                if (resp.statusCode == 404 && data.error.code == 17) {
                    pxt.log(`parent directory missing for ${name}`);
                    const par = name.replace(/\/[^\/]+$/, "");
                    if (par != name) {
                        return createDirectoryAsync(branch, prj, key, par, incr)
                            .then(() => createDirectoryAsync(branch, prj, key, name, incr)); // retry
                    }
                }
                throw new Error(`cannot create directory ${branch || ""}/${name}: ${resp.statusCode} ${JSON.stringify(data)}`);
            });
        }
        crowdin.createDirectoryAsync = createDirectoryAsync;
        function normalizeFileName(filename) {
            return filename.replace(/\\/g, '/');
        }
        function uploadTranslationAsync(branch, prj, key, filename, data) {
            pxt.Util.assert(!!prj);
            pxt.Util.assert(!!key);
            filename = normalizeFileName(filename);
            const incr = mkIncr(filename);
            function startAsync() {
                return uploadAsync("update-file", { update_option: "update_as_unapproved" });
            }
            function uploadAsync(op, opts) {
                opts["type"] = "auto";
                opts["json"] = "";
                opts["escape_quotes"] = "0";
                incr();
                return multipartPostAsync(key, apiUri(branch, prj, key, op), opts, filename, data)
                    .then(resp => handleResponseAsync(resp));
            }
            function handleResponseAsync(resp) {
                const code = resp.statusCode;
                const errorData = pxt.Util.jsonTryParse(resp.text) || {};
                pxt.debug(`upload result: ${code}`);
                if (code == 404 && errorData.error && errorData.error.code == 8) {
                    pxt.log(`create new translation file: ${filename}`);
                    return uploadAsync("add-file", {});
                }
                else if (code == 404 && errorData.error && errorData.error.code == 17) {
                    return createDirectoryAsync(branch, prj, key, filename.replace(/\/[^\/]+$/, ""), incr)
                        .then(() => startAsync());
                }
                else if (!errorData.success && errorData.error && errorData.error.code == 53) {
                    // file is being updated
                    pxt.log(`${filename} being updated, waiting 5s and retry...`);
                    return pxt.U.delay(5000) // wait 5s and try again
                        .then(() => uploadTranslationAsync(branch, prj, key, filename, data));
                }
                else if (code == 200 || errorData.success) {
                    // something crowdin reports 500 with success=true
                    return Promise.resolve();
                }
                else {
                    throw new Error(`Error, upload translation: ${filename}, ${code}, ${resp.text}`);
                }
            }
            return startAsync();
        }
        crowdin.uploadTranslationAsync = uploadTranslationAsync;
        function flatten(allFiles, node, parentDir, branch) {
            const n = node.name;
            const d = parentDir ? parentDir + "/" + n : n;
            node.fullName = d;
            node.branch = branch || "";
            switch (node.node_type) {
                case "file":
                    allFiles.push(node);
                    break;
                case "directory":
                    (node.files || []).forEach(f => flatten(allFiles, f, d, branch));
                    break;
                case "branch":
                    (node.files || []).forEach(f => flatten(allFiles, f, parentDir, node.name));
                    break;
            }
        }
        function filterAndFlattenFiles(files, crowdinPath) {
            const pxtCrowdinBranch = pxt.appTarget.versions.pxtCrowdinBranch || "";
            const targetCrowdinBranch = pxt.appTarget.versions.targetCrowdinBranch || "";
            let allFiles = [];
            // flatten the files
            files.forEach(f => flatten(allFiles, f, ""));
            // top level files are for PXT, subolder are targets
            allFiles = allFiles.filter(f => {
                if (f.fullName.indexOf('/') < 0)
                    return f.branch == pxtCrowdinBranch; // pxt file
                else
                    return f.branch == targetCrowdinBranch;
            });
            // folder filter
            if (crowdinPath) {
                // filter out crowdin folder
                allFiles = allFiles.filter(f => f.fullName.indexOf(crowdinPath) == 0);
            }
            // filter out non-target files
            if (pxt.appTarget.id != "core") {
                const id = pxt.appTarget.id + '/';
                allFiles = allFiles.filter(f => {
                    return f.fullName.indexOf('/') < 0 // top level file
                        || f.fullName.substr(0, id.length) == id // from the target folder
                        || f.fullName.indexOf('common-docs') >= 0; // common docs
                });
            }
            return allFiles;
        }
        function projectInfoAsync(prj, key) {
            const q = { json: "true" };
            const infoUri = apiUri("", prj, key, "info", q);
            return pxt.Util.httpGetTextAsync(infoUri).then(respText => {
                const info = JSON.parse(respText);
                return info;
            });
        }
        crowdin.projectInfoAsync = projectInfoAsync;
        /**
         * Scans files in crowdin and report files that are not on disk anymore
         */
        function listFilesAsync(prj, key, crowdinPath) {
            pxt.log(`crowdin: listing files under ${crowdinPath}`);
            return projectInfoAsync(prj, key)
                .then(info => {
                if (!info)
                    throw new Error("info failed");
                let allFiles = filterAndFlattenFiles(info.files, crowdinPath);
                pxt.debug(`crowdin: found ${allFiles.length} under ${crowdinPath}`);
                return allFiles.map(f => {
                    return {
                        fullName: f.fullName,
                        branch: f.branch || ""
                    };
                });
            });
        }
        crowdin.listFilesAsync = listFilesAsync;
        function languageStatsAsync(prj, key, lang) {
            const uri = apiUri("", prj, key, "language-status", { language: lang, json: "true" });
            return pxt.Util.httpGetJsonAsync(uri)
                .then(info => {
                const allFiles = filterAndFlattenFiles(info.files);
                return allFiles;
            });
        }
        crowdin.languageStatsAsync = languageStatsAsync;
        function inContextLoadAsync(text) {
            const node = document.createElement("input");
            node.type = "text";
            node.setAttribute("class", "hidden");
            node.value = text;
            let p = new Promise((resolve, reject) => {
                const observer = new MutationObserver(() => {
                    if (text == node.value)
                        return;
                    const r = pxt.Util.rlf(node.value); // get rid of {id}...
                    node.remove();
                    observer.disconnect();
                    resolve(r);
                });
                observer.observe(node, { attributes: true });
            });
            document.body.appendChild(node);
            return p;
        }
        crowdin.inContextLoadAsync = inContextLoadAsync;
    })(crowdin = pxt.crowdin || (pxt.crowdin = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var diff;
    (function (diff_1) {
        /*
        Constant MAX ∈ [0,M+N]
        Var V: Array [− MAX .. MAX] of Integer
        V[1]←0
        For D←0 to MAX Do
            For k ← −D to D in steps of 2 Do
                If k=−D or k≠D and V[k−1]<V[k+1] Then
                    x ← V[k+1]
                Else
                    x ← V[k−1]+1
                y←x−k
                While x<N and y<M and a[x+1] =b[y+1] Do
                    (x,y)←(x+1,y+1)
                V[k]←x
                If x≥N and y≥M Then
                    Length of an SES is D
                    Stop
        */
        function toLines(file) {
            return file ? file.split(/\r?\n/) : [];
        }
        diff_1.toLines = toLines;
        // based on An O(ND) Difference Algorithm and Its Variations by EUGENE W. MYERS
        function compute(fileA, fileB, options = {}) {
            if (options.ignoreWhitespace) {
                fileA = fileA.replace(/[\r\n]+$/, "");
                fileB = fileB.replace(/[\r\n]+$/, "");
            }
            const a = toLines(fileA);
            const b = toLines(fileB);
            const MAX = Math.min(options.maxDiffSize || 1024, a.length + b.length);
            if (MAX == 0) // nothing to diff
                return [];
            const ctor = a.length > 0xfff0 ? Uint32Array : Uint16Array;
            const idxmap = {};
            let curridx = 0;
            const aidx = mkidx(a), bidx = mkidx(b);
            function mkidx(strings) {
                const idxarr = new ctor(strings.length);
                let i = 0;
                for (let e of strings) {
                    if (options.ignoreWhitespace)
                        e = e.replace(/\s+$/g, "").replace(/^\s+/g, ''); // only ignore start/end of lines
                    if (idxmap.hasOwnProperty(e))
                        idxarr[i] = idxmap[e];
                    else {
                        ++curridx;
                        idxarr[i] = curridx;
                        idxmap[e] = curridx;
                    }
                    i++;
                }
                return idxarr;
            }
            const V = new ctor(2 * MAX + 1);
            let diffLen = -1;
            for (let D = 0; D <= MAX; D++) {
                if (computeFor(D, V) != null) {
                    diffLen = D;
                }
            }
            if (diffLen == -1)
                return null; // diffLen > MAX
            const trace = [];
            let endpoint = null;
            for (let D = 0; D <= diffLen; D++) {
                const V = trace.length ? trace[trace.length - 1].slice(0) : new ctor(2 * diffLen + 1);
                trace.push(V);
                endpoint = computeFor(D, V);
                if (endpoint != null)
                    break;
            }
            const diff = [];
            let k = endpoint;
            for (let D = trace.length - 1; D >= 0; D--) {
                const V = trace[D];
                let x = 0;
                let nextK = 0;
                if (k == -D || (k != D && V[MAX + k - 1] < V[MAX + k + 1])) {
                    nextK = k + 1;
                    x = V[MAX + nextK];
                }
                else {
                    nextK = k - 1;
                    x = V[MAX + nextK] + 1;
                }
                let y = x - k;
                const snakeLen = V[MAX + k] - x;
                for (let i = snakeLen - 1; i >= 0; --i)
                    diff.push("  " + b[y + i]);
                if (nextK == k - 1) {
                    diff.push("- " + a[x - 1]);
                }
                else {
                    if (y > 0)
                        diff.push("+ " + b[y - 1]);
                }
                k = nextK;
            }
            diff.reverse();
            if (options.context == Infinity || options.full)
                return diff;
            let aline = 1, bline = 1, idx = 0;
            const shortDiff = [];
            const context = options.context || 3;
            while (idx < diff.length) {
                let nextIdx = idx;
                while (nextIdx < diff.length && diff[nextIdx][0] == " ")
                    nextIdx++;
                if (nextIdx == diff.length)
                    break;
                const startIdx = nextIdx - context;
                const skip = startIdx - idx;
                if (skip > 0) {
                    aline += skip;
                    bline += skip;
                    idx = startIdx;
                }
                const hdPos = shortDiff.length;
                const aline0 = aline, bline0 = bline;
                shortDiff.push("@@"); // patched below
                let endIdx = idx;
                let numCtx = 0;
                while (endIdx < diff.length) {
                    if (diff[endIdx][0] == " ") {
                        numCtx++;
                        if (numCtx > context * 2 + 2) {
                            endIdx -= context + 2;
                            break;
                        }
                    }
                    else {
                        numCtx = 0;
                    }
                    endIdx++;
                }
                while (idx < endIdx) {
                    shortDiff.push(diff[idx]);
                    const c = diff[idx][0];
                    switch (c) {
                        case "-":
                            aline++;
                            break;
                        case "+":
                            bline++;
                            break;
                        case " ":
                            aline++;
                            bline++;
                            break;
                    }
                    idx++;
                }
                shortDiff[hdPos] = `@@ -${aline0},${aline - aline0} +${bline0},${bline - bline0} @@`;
            }
            return shortDiff;
            function computeFor(D, V) {
                for (let k = -D; k <= D; k += 2) {
                    let x = 0;
                    if (k == -D || (k != D && V[MAX + k - 1] < V[MAX + k + 1]))
                        x = V[MAX + k + 1];
                    else
                        x = V[MAX + k - 1] + 1;
                    let y = x - k;
                    while (x < aidx.length && y < bidx.length && aidx[x] == bidx[y]) {
                        x++;
                        y++;
                    }
                    V[MAX + k] = x;
                    if (x >= aidx.length && y >= bidx.length) {
                        return k;
                    }
                }
                return null;
            }
        }
        diff_1.compute = compute;
        // based on "A Formal Investigation of Diff3" by Sanjeev Khanna, Keshav Kunal, and Benjamin C. Pierce
        function diff3(fileA, fileO, fileB, lblA, lblB) {
            const ma = computeMatch(fileA);
            const mb = computeMatch(fileB);
            if (!ma || !mb) // diff failed, can't merge
                return undefined;
            const fa = toLines(fileA);
            const fb = toLines(fileB);
            let numConflicts = 0;
            let r = [];
            let la = 0, lb = 0;
            for (let i = 0; i < ma.length - 1;) {
                if (ma[i] == la && mb[i] == lb) {
                    r.push(fa[la]);
                    la++;
                    lb++;
                    i++;
                }
                else {
                    let aSame = true;
                    let bSame = true;
                    let j = i;
                    while (j < ma.length) {
                        if (ma[j] != la + j - i)
                            aSame = false;
                        if (mb[j] != lb + j - i)
                            bSame = false;
                        if (ma[j] != null && mb[j] != null)
                            break;
                        j++;
                    }
                    pxt.U.assert(j < ma.length);
                    if (aSame) {
                        while (lb < mb[j])
                            r.push(fb[lb++]);
                    }
                    else if (bSame) {
                        while (la < ma[j])
                            r.push(fa[la++]);
                    }
                    else if (fa.slice(la, ma[j]).join("\n") == fb.slice(lb, mb[j]).join("\n")) {
                        // false conflict - both are the same
                        while (la < ma[j])
                            r.push(fa[la++]);
                    }
                    else {
                        numConflicts++;
                        r.push("<<<<<<< " + lblA);
                        while (la < ma[j])
                            r.push(fa[la++]);
                        r.push("=======");
                        while (lb < mb[j])
                            r.push(fb[lb++]);
                        r.push(">>>>>>> " + lblB);
                    }
                    i = j;
                    la = ma[j];
                    lb = mb[j];
                }
            }
            return { merged: r.join("\n"), numConflicts };
            function computeMatch(fileA) {
                const da = compute(fileO, fileA, { context: Infinity });
                if (!da)
                    return undefined;
                const ma = [];
                let aidx = 0;
                let oidx = 0;
                // console.log(da)
                for (let l of da) {
                    if (l[0] == "+") {
                        aidx++;
                    }
                    else if (l[0] == "-") {
                        ma[oidx] = null;
                        oidx++;
                    }
                    else if (l[0] == " ") {
                        ma[oidx] = aidx;
                        aidx++;
                        oidx++;
                    }
                    else {
                        pxt.U.oops();
                    }
                }
                ma.push(aidx + 1); // terminator
                return ma;
            }
        }
        diff_1.diff3 = diff3;
        function removeTrailingSemiColumns(src) {
            return toLines(src).map(line => line.replace(/;\s*$/, '')).join('\n');
        }
        diff_1.removeTrailingSemiColumns = removeTrailingSemiColumns;
        function split(dualSrc, options) {
            const src = dualSrc.split(/-{10,}/, 2);
            if (src.length < 2)
                return { fileA: dualSrc, fileB: undefined };
            let fileA = src[0].replace(/\n$/, ''); // intial new line introduced by html
            let fileB = src[1].replace(/^\n/, ''); // last new line introduct by html
            if (options && options.removeTrailingSemiColumns) {
                fileA = removeTrailingSemiColumns(fileA);
                fileB = removeTrailingSemiColumns(fileB);
            }
            return { fileA, fileB };
        }
        diff_1.split = split;
        function parseDiffMarker(ln) {
            const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+)/.exec(ln);
            return m && {
                oldStart: parseInt(m[1]) - 1,
                oldLength: parseInt(m[2]),
                newStart: parseInt(m[3]) - 1,
                newLength: parseInt(m[4])
            };
        }
        diff_1.parseDiffMarker = parseDiffMarker;
        function render(fileA, fileB, options = {}) {
            const diffLines = compute(fileA, fileB, options);
            if (!diffLines) {
                return pxt.dom.el("div", null, pxtc.Util.lf("Too many differences to render diff."));
            }
            const diffClasses = {
                "@": "diff-marker",
                " ": "diff-unchanged",
                "+": "diff-added",
                "-": "diff-removed",
            };
            let lnA = 0, lnB = 0;
            let lastMark = "";
            const tbody = pxt.dom.el("tbody");
            const diffEl = pxt.dom.el("table", {
                "class": `diffview ${options.update ? 'update' : ''}`
            }, tbody);
            let savedDiffEl = null;
            diffLines.forEach((ln, idx) => {
                const m = parseDiffMarker(ln);
                if (m) {
                    lnA = m.oldStart;
                    lnB = m.newStart;
                }
                else {
                    if (ln[0] != "+")
                        lnA++;
                    if (ln[0] != "-")
                        lnB++;
                }
                const nextMark = diffLines[idx + 1] ? diffLines[idx + 1][0] : "";
                const next2Mark = diffLines[idx + 2] ? diffLines[idx + 2][0] : "";
                const lnSrc = ln.slice(2);
                let currDiff = pxt.dom.el("code", null, lnSrc);
                if (savedDiffEl) {
                    currDiff = savedDiffEl;
                    savedDiffEl = null;
                }
                else if (ln[0] == "-" && (lastMark == " " || lastMark == "@") && nextMark == "+"
                    && (next2Mark == " " || next2Mark == "@" || next2Mark == "")) {
                    const r = lineDiff(ln.slice(2), diffLines[idx + 1].slice(2));
                    currDiff = r.a;
                    savedDiffEl = r.b;
                }
                lastMark = ln[0];
                // check if line is skipped
                if ((options.hideMarkerLine && lastMark == "@")
                    || (options.hideRemoved && lastMark == "-"))
                    return;
                // add diff
                const isMarkerLine = lastMark == "@";
                const className = `${diffClasses[lastMark]}`;
                tbody.appendChild(pxt.dom.el("tr", { "class": className }, [
                    !options.hideLineNumbers && pxt.dom.el("td", { class: "line-a", "data-content": lnA }),
                    !options.hideLineNumbers && pxt.dom.el("td", { class: "line-b", "data-content": lnB }),
                    isMarkerLine && pxt.dom.el("td", { "colspan": 2, class: "change" }, pxt.dom.el("code", null, ln)),
                    !options.hideMarker && !isMarkerLine && pxt.dom.el("td", { class: "marker", "data-content": lastMark }),
                    !isMarkerLine && pxt.dom.el("td", { class: "change" }, currDiff)
                ]));
            });
            return diffEl;
        }
        diff_1.render = render;
        function lineDiff(lineA, lineB) {
            const df = compute(lineA.split("").join("\n"), lineB.split("").join("\n"), {
                context: Infinity
            });
            if (!df) // diff failed
                return {
                    a: pxt.dom.el("div", { "class": "inline-diff" }, pxt.dom.el("code", null, lineA)),
                    b: pxt.dom.el("div", { "class": "inline-diff" }, pxt.dom.el("code", null, lineB))
                };
            const ja = [];
            const jb = [];
            for (let i = 0; i < df.length;) {
                let j = i;
                const mark = df[i][0];
                while (df[j] && df[j][0] == mark)
                    j++;
                const chunk = df.slice(i, j).map(s => s.slice(2)).join("");
                if (mark == " ") {
                    ja.push(pxt.dom.el("code", { "class": "ch-common" }, chunk));
                    jb.push(pxt.dom.el("code", { "class": "ch-common" }, chunk));
                }
                else if (mark == "-") {
                    ja.push(pxt.dom.el("code", { "class": "ch-removed" }, chunk));
                }
                else if (mark == "+") {
                    jb.push(pxt.dom.el("code", { "class": "ch-added" }, chunk));
                }
                else {
                    pxt.Util.oops();
                }
                i = j;
            }
            return {
                a: pxt.dom.el("div", { "class": "inline-diff" }, ja),
                b: pxt.dom.el("div", { "class": "inline-diff" }, jb)
            };
        }
        function resolveMergeConflictMarker(content, startMarkerLine, local, remote) {
            let lines = pxt.diff.toLines(content);
            let startLine = startMarkerLine;
            while (startLine < lines.length) {
                if (/^<<<<<<<[^<]/.test(lines[startLine])) {
                    break;
                }
                startLine++;
            }
            let middleLine = startLine + 1;
            while (middleLine < lines.length) {
                if (/^=======$/.test(lines[middleLine]))
                    break;
                middleLine++;
            }
            let endLine = middleLine + 1;
            while (endLine < lines.length) {
                if (/^>>>>>>>[^>]/.test(lines[endLine])) {
                    break;
                }
                endLine++;
            }
            if (endLine >= lines.length) {
                // no match?
                pxt.debug(`diff marker mistmatch: ${lines.length} -> ${startLine} ${middleLine} ${endLine}`);
                return content;
            }
            // remove locals
            lines[startLine] = undefined;
            lines[middleLine] = undefined;
            lines[endLine] = undefined;
            if (!local)
                for (let i = startLine; i <= middleLine; ++i)
                    lines[i] = undefined;
            if (!remote)
                for (let i = middleLine; i <= endLine; ++i)
                    lines[i] = undefined;
            return lines.filter(line => line !== undefined).join("\n");
        }
        diff_1.resolveMergeConflictMarker = resolveMergeConflictMarker;
        /**
         * A naive 3way merge for pxt.json files. It can mostly handle conflicts when adding/removing files concurrently.
         * - highest version number if kept
         * - current preferred editor is kept
         * - conjection of public flag
         * - files list is merged so that added files are kept and deleted files are removed
         * @param configA
         * @param configO
         * @param configB
         */
        function mergeDiff3Config(configA, configO, configB) {
            let jsonA = pxt.Util.jsonTryParse(configA); //  as pxt.PackageConfig
            let jsonO = pxt.Util.jsonTryParse(configO);
            let jsonB = pxt.Util.jsonTryParse(configB);
            // A is good, B destroyed
            if (jsonA && !jsonB)
                return configA; // keep A
            // A destroyed, B good, use B or O
            if (!jsonA)
                return configB || configO;
            // O is destroyed, B isnt, use B as O
            if (!jsonO && jsonB)
                jsonO = jsonB;
            // final check
            if (!jsonA || !jsonO || !jsonB)
                return undefined;
            delete jsonA.installedVersion;
            delete jsonO.installedVersion;
            delete jsonB.installedVersion;
            const r = {};
            const keys = pxt.U.unique(Object.keys(jsonO).concat(Object.keys(jsonA)).concat(Object.keys(jsonB)), l => l);
            for (const key of keys) {
                const vA = jsonA[key];
                const vO = jsonO[key];
                const vB = jsonB[key];
                const svA = JSON.stringify(vA);
                const svB = JSON.stringify(vB);
                if (svA == svB) { // same serialized keys
                    if (vA !== undefined)
                        r[key] = vA;
                }
                else {
                    switch (key) {
                        case "name":
                            r[key] = mergeName(vA, vO, vB);
                            break;
                        case "version": // pick highest version
                            r[key] = pxt.semver.strcmp(vA, vB) > 0 ? vA : vB;
                            break;
                        case "languageRestriction":
                        case "preferredEditor":
                        case "targetVersion":
                            r[key] = vA; // keep current one
                            break;
                        case "public":
                            r[key] = vA && vB;
                            break;
                        case "files":
                        case "testFiles": { // merge file arrays
                            const m = mergeFiles(vA || [], vO || [], vB || []);
                            if (!m)
                                return undefined;
                            r[key] = m.length ? m : undefined;
                            break;
                        }
                        case "dependencies":
                        case "testDependencies": {
                            const m = mergeDependencies(vA || {}, vO || {}, vB || {});
                            if (Object.keys(m).length)
                                return undefined;
                            r[key] = m;
                            break;
                        }
                        case "description":
                            if (vA && !vB)
                                r[key] = vA; // new description
                            else if (!vA && vB)
                                r[key] = vB;
                            else
                                return undefined;
                            break;
                        default:
                            return undefined;
                    }
                }
            }
            return pxt.Package.stringifyConfig(r);
            function mergeName(fA, fO, fB) {
                if (fA == fO)
                    return fB;
                if (fB == fO)
                    return fA;
                if (fA == lf("Untitled"))
                    return fB;
                return fA;
            }
            function mergeFiles(fA, fO, fB) {
                const r = [];
                const fkeys = pxt.U.unique(fO.concat(fA).concat(fB), l => l);
                for (const fkey of fkeys) {
                    const mA = fA.indexOf(fkey) > -1;
                    const mB = fB.indexOf(fkey) > -1;
                    const mO = fO.indexOf(fkey) > -1;
                    if (mA == mB) { // both have or have nots
                        if (mA) // key is in set
                            r.push(fkey);
                    }
                    else { // conflict
                        if (mB == mO) { // mB not changed, false conflict
                            if (mA) // item added
                                r.push(fkey);
                        }
                        else { // mA == mO, conflict
                            if (mB) // not deleted by A
                                r.push(fkey);
                        }
                    }
                }
                return r;
            }
            function mergeDependencies(fA, fO, fB) {
                const r = {};
                const fkeys = pxt.U.unique(Object.keys(fO).concat(Object.keys(fA)).concat(Object.keys(fB)), l => l);
                for (const fkey of fkeys) {
                    const mA = fA[fkey];
                    const mB = fB[fkey];
                    const mO = fO[fkey];
                    if (mA == mB) { // both have or have nots
                        if (mA) // key is in set
                            r[fkey] = mA;
                    }
                    else { // conflict
                        // check if it is a version change in github reference
                        const ghA = pxt.github.parseRepoId(mA);
                        const ghB = pxt.github.parseRepoId(mB);
                        if (ghA && ghB
                            && pxt.semver.tryParse(ghA.tag)
                            && pxt.semver.tryParse(ghB.tag)
                            && ghA.owner && ghA.project
                            && ghA.owner == ghB.owner
                            && ghA.project == ghB.project) {
                            const newtag = pxt.semver.strcmp(ghA.tag, ghB.tag) > 0
                                ? ghA.tag : ghB.tag;
                            r[fkey] = `github:${ghA.owner}/${ghA.project}#${newtag}`;
                        }
                        else if (mB == mO) { // mB not changed, false conflict
                            if (mA) // item added
                                r[fkey] = mA;
                        }
                        else { // mA == mO, conflict
                            if (mB) // not deleted by A
                                r[fkey] = mB;
                        }
                    }
                }
                return r;
            }
        }
        diff_1.mergeDiff3Config = mergeDiff3Config;
        function hasMergeConflictMarker(content) {
            return content && /^(<<<<<<<[^<]|>>>>>>>[^>])/m.test(content);
        }
        diff_1.hasMergeConflictMarker = hasMergeConflictMarker;
        function reconstructConfig(parsed, files, commit, tp) {
            let dependencies = {};
            // grab files from commit
            let commitFiles = commit.tree.tree.map(f => f.path)
                .filter(f => /\.(ts|blocks|md|jres|asm|json)$/.test(f))
                .filter(f => f != pxt.CONFIG_NAME);
            if (parsed.fileName)
                commitFiles = commitFiles
                    .filter(f => f.indexOf(parsed.fileName) === 0)
                    .map(f => f.slice(parsed.fileName.length + 1));
            // if no available files, include the files from the template
            if (!commitFiles.find(f => /\.ts$/.test(f))) {
                tp.config.files.filter(f => commitFiles.indexOf(f) < 0)
                    .forEach(f => {
                    commitFiles.push(f);
                    files[f] = tp.files[f];
                });
                pxt.Util.jsonCopyFrom(dependencies, tp.config.dependencies);
            }
            // include corepkg if no dependencies
            if (!Object.keys(dependencies).length)
                dependencies[pxt.appTarget.corepkg] = "*";
            // yay, we have a new cfg
            const cfg = {
                name: "",
                files: commitFiles,
                dependencies,
                preferredEditor: commitFiles.find(f => /.blocks$/.test(f)) ? pxt.BLOCKS_PROJECT_NAME : pxt.JAVASCRIPT_PROJECT_NAME
            };
            return cfg;
        }
        diff_1.reconstructConfig = reconstructConfig;
    })(diff = pxt.diff || (pxt.diff = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var discourse;
    (function (discourse) {
        function extractSharedIdFromPostUrl(url) {
            // https://docs.discourse.org/#tag/Posts%2Fpaths%2F~1posts~1%7Bid%7D.json%2Fget
            return pxt.Util.httpGetJsonAsync(url + ".json")
                .then((json) => {
                // extract from post_stream
                let projectId = json.post_stream
                    && json.post_stream.posts
                    && json.post_stream.posts[0]
                    && json.post_stream.posts[0].link_counts
                        .map(link => pxt.Cloud.parseScriptId(link.url))
                        .filter(id => !!id)[0];
                return projectId;
            });
        }
        discourse.extractSharedIdFromPostUrl = extractSharedIdFromPostUrl;
        function topicsByTag(apiUrl, tag) {
            apiUrl = apiUrl.replace(/\/$/, '');
            const q = `${apiUrl}/tag/${tag}.json`;
            return pxt.Util.httpGetJsonAsync(q)
                .then((json) => {
                const users = pxt.Util.toDictionary(json.users, u => u.id.toString());
                return json.topic_list.topics.map(t => {
                    return {
                        id: t.id,
                        title: t.title,
                        url: `${apiUrl}/t/${t.slug}/${t.id}`,
                        imageUrl: t.image_url,
                        author: users[t.posters[0].user_id].username,
                        cardType: "forumUrl"
                    };
                });
            });
        }
        discourse.topicsByTag = topicsByTag;
    })(discourse = pxt.discourse || (pxt.discourse = {}));
})(pxt || (pxt = {}));
/// <reference path='../localtypings/pxtarget.d.ts' />
/// <reference path='../localtypings/dompurify.d.ts' />
/// <reference path="commonutil.ts"/>
var pxt;
(function (pxt) {
    var docs;
    (function (docs) {
        var U = pxtc.Util;
        let markedInstance;
        let stdboxes = {};
        let stdmacros = {};
        const stdSetting = "<!-- @CMD@ @ARGS@ -->";
        let stdsettings = {
            "parent": stdSetting,
            "short": stdSetting,
            "description": "<!-- desc -->",
            "activities": "<!-- activities -->",
            "explicitHints": "<!-- hints -->",
            "flyoutOnly": "<!-- flyout -->",
            "hideIteration": "<!-- iter -->",
            "codeStart": "<!-- start -->",
            "codeStop": "<!-- stop -->",
            "autoOpen": "<!-- autoOpen -->",
            "autoexpandOff": "<!-- autoexpandOff -->",
            "preferredEditor": "<!-- preferredEditor -->",
            "tutorialCodeValidation": "<!-- tutorialCodeValidation -->"
        };
        function replaceAll(replIn, x, y) {
            return replIn.split(x).join(y);
        }
        function htmlQuote(s) {
            s = replaceAll(s, "&", "&amp;");
            s = replaceAll(s, "<", "&lt;");
            s = replaceAll(s, ">", "&gt;");
            s = replaceAll(s, "\"", "&quot;");
            s = replaceAll(s, "\'", "&#39;");
            return s;
        }
        docs.htmlQuote = htmlQuote;
        // the input already should be HTML-quoted but we want to make sure, and also quote quotes
        function html2Quote(s) {
            if (!s)
                return s;
            return htmlQuote(s.replace(/\&([#a-z0-9A-Z]+);/g, (f, ent) => {
                switch (ent) {
                    case "amp": return "&";
                    case "lt": return "<";
                    case "gt": return ">";
                    case "quot": return "\"";
                    default:
                        if (ent[0] == "#")
                            return String.fromCharCode(parseInt(ent.slice(1)));
                        else
                            return f;
                }
            }));
        }
        docs.html2Quote = html2Quote;
        //The extra YouTube macros are in case there is a timestamp on the YouTube URL.
        //TODO: Add equivalent support for youtu.be links
        const links = [
            {
                rx: /^vimeo\.com\/(\d+)/i,
                cmd: "### @vimeo $1"
            },
            {
                rx: /^(www\.youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]+(\#t=([0-9]+m[0-9]+s|[0-9]+m|[0-9]+s))?)/i,
                cmd: "### @youtube $2"
            }
        ];
        docs.requireMarked = () => {
            if (typeof marked !== "undefined")
                return marked;
            if (typeof require === "undefined")
                return undefined;
            return require("marked");
        };
        docs.requireDOMSanitizer = () => {
            if (typeof DOMPurify !== "undefined")
                return DOMPurify.sanitize;
            if (typeof require === "undefined")
                return undefined;
            return require("DOMPurify").sanitize;
        };
        function parseHtmlAttrs(s) {
            let attrs = {};
            while (s.trim()) {
                let m = /\s*([^=\s]+)=("([^"]*)"|'([^']*)'|(\S*))/.exec(s);
                if (m) {
                    let v = m[3] || m[4] || m[5] || "";
                    attrs[m[1].toLowerCase()] = v;
                }
                else {
                    m = /^\s*(\S+)/.exec(s);
                    attrs[m[1]] = "true";
                }
                s = s.slice(m[0].length);
            }
            return attrs;
        }
        const error = (s) => `<div class='ui negative message'>${htmlQuote(s)}</div>`;
        function prepTemplate(d) {
            let boxes = U.clone(stdboxes);
            let macros = U.clone(stdmacros);
            let settings = U.clone(stdsettings);
            let menus = {};
            let toc = {};
            let params = d.params;
            let theme = d.theme;
            d.boxes = boxes;
            d.macros = macros;
            d.settings = settings;
            d.html = d.html.replace(/<aside\s+([^<>]+)>([^]*?)<\/aside>/g, (full, attrsStr, body) => {
                let attrs = parseHtmlAttrs(attrsStr);
                let name = attrs["data-name"] || attrs["id"];
                if (!name)
                    return error("id or data-name missing on macro");
                if (/box/.test(attrs["class"])) {
                    boxes[name] = body;
                }
                else if (/aside/.test(attrs["class"])) {
                    boxes[name] = `<!-- BEGIN-ASIDE ${name} -->${body}<!-- END-ASIDE -->`;
                }
                else if (/setting/.test(attrs["class"])) {
                    settings[name] = body;
                }
                else if (/menu/.test(attrs["class"])) {
                    menus[name] = body;
                }
                else if (/toc/.test(attrs["class"])) {
                    toc[name] = body;
                }
                else {
                    macros[name] = body;
                }
                return `<!-- macro ${name} -->`;
            });
            let recMenu = (m, lev) => {
                let templ = menus["item"];
                let mparams = {
                    NAME: m.name,
                };
                if (m.subitems) {
                    if (!!menus["toc-dropdown"]) {
                        templ = menus["toc-dropdown"];
                    }
                    else {
                        /** TODO: when all targets bumped to include https://github.com/microsoft/pxt/pull/6058,
                         * swap templ assignments below with the commented out version, and remove
                         * top-dropdown, top-dropdown-noheading, inner-dropdown, and nested-dropdown from
                         * docfiles/macros.html **/
                        if (lev == 0)
                            templ = menus["top-dropdown"];
                        else
                            templ = menus["inner-dropdown"];
                    }
                    mparams["ITEMS"] = m.subitems.map(e => recMenu(e, lev + 1)).join("\n");
                }
                else {
                    if (/^-+$/.test(m.name)) {
                        templ = menus["divider"];
                    }
                    if (m.path && !/^(https?:|\/)/.test(m.path))
                        return error("Invalid link: " + m.path);
                    mparams["LINK"] = m.path;
                }
                return injectHtml(templ, mparams, ["ITEMS"]);
            };
            let breadcrumb = [{
                    name: lf("Docs"),
                    href: "/docs"
                }];
            const TOC = d.TOC || theme.TOC || [];
            let tocPath = [];
            let isCurrentTOC = (m) => {
                for (let c of m.subitems || []) {
                    if (isCurrentTOC(c)) {
                        tocPath.push(m);
                        return true;
                    }
                }
                if (d.filepath && !!m.path && d.filepath.indexOf(m.path) == 0) {
                    tocPath.push(m);
                    return true;
                }
                return false;
            };
            TOC.forEach(isCurrentTOC);
            let recTOC = (m, lev) => {
                let templ = toc["item"];
                let mparams = {
                    NAME: m.name,
                };
                if (m.path && !/^(https?:|\/)/.test(m.path))
                    return error("Invalid link: " + m.path);
                if (/^\//.test(m.path) && d.versionPath)
                    m.path = `/${d.versionPath}${m.path}`;
                mparams["LINK"] = m.path;
                if (tocPath.indexOf(m) >= 0) {
                    mparams["ACTIVE"] = 'active';
                    mparams["EXPANDED"] = 'true';
                    breadcrumb.push({
                        name: m.name,
                        href: m.path
                    });
                }
                else {
                    mparams["EXPANDED"] = 'false';
                }
                if (m.subitems && m.subitems.length > 0) {
                    if (!!toc["toc-dropdown"]) {
                        // if macros support "toc-*", use them
                        if (m.name !== "") {
                            templ = toc["toc-dropdown"];
                        }
                        else {
                            templ = toc["toc-dropdown-noLink"];
                        }
                    }
                    else {
                        // if macros don't support "toc-*"
                        /** TODO: when all targets bumped to include https://github.com/microsoft/pxt/pull/6058,
                         * delete this else branch, and remove
                         * top-dropdown, top-dropdown-noheading, inner-dropdown, and nested-dropdown from
                         * docfiles/macros.html **/
                        if (lev == 0) {
                            if (m.name !== "") {
                                templ = toc["top-dropdown"];
                            }
                            else {
                                templ = toc["top-dropdown-noHeading"];
                            }
                        }
                        else if (lev == 1)
                            templ = toc["inner-dropdown"];
                        else
                            templ = toc["nested-dropdown"];
                    }
                    mparams["ITEMS"] = m.subitems.map(e => recTOC(e, lev + 1)).join("\n");
                }
                else {
                    if (/^-+$/.test(m.name)) {
                        templ = toc["divider"];
                    }
                }
                return injectHtml(templ, mparams, ["ITEMS"]);
            };
            params["menu"] = (theme.docMenu || []).map(e => recMenu(e, 0)).join("\n");
            params["TOC"] = TOC.map(e => recTOC(e, 0)).join("\n");
            if (theme.appStoreID)
                params["appstoremeta"] = `<meta name="apple-itunes-app" content="app-id=${U.htmlEscape(theme.appStoreID)}"/>`;
            let breadcrumbHtml = '';
            if (breadcrumb.length > 1) {
                breadcrumbHtml = `
            <nav class="ui breadcrumb" aria-label="${lf("Breadcrumb")}">
                ${breadcrumb.map((b, i) => `<a class="${i == breadcrumb.length - 1 ? "active" : ""} section"
                        href="${html2Quote(b.href)}" aria-current="${i == breadcrumb.length - 1 ? "page" : ""}">${html2Quote(b.name)}</a>`)
                    .join('<i class="right chevron icon divider"></i>')}
            </nav>`;
            }
            params["breadcrumb"] = breadcrumbHtml;
            if (theme.boardName)
                params["boardname"] = html2Quote(theme.boardName);
            if (theme.boardNickname)
                params["boardnickname"] = html2Quote(theme.boardNickname);
            if (theme.driveDisplayName)
                params["drivename"] = html2Quote(theme.driveDisplayName);
            if (theme.homeUrl)
                params["homeurl"] = html2Quote(theme.homeUrl);
            params["targetid"] = theme.id || "???";
            params["targetname"] = theme.name || "Microsoft MakeCode";
            params["docsheader"] = theme.docsHeader || "Documentation";
            params["orgtitle"] = "MakeCode";
            const docsLogo = theme.docsLogo && U.htmlEscape(theme.docsLogo);
            const orgLogo = (theme.organizationLogo || theme.organizationWideLogo) && U.htmlEscape(theme.organizationLogo || theme.organizationWideLogo);
            const orglogomobile = theme.organizationLogo && U.htmlEscape(theme.organizationLogo);
            params["targetlogo"] = docsLogo ? `<img aria-hidden="true" role="presentation" class="ui ${theme.logoWide ? "small" : "mini"} image" src="${docsLogo}" />` : "";
            params["orglogo"] = orgLogo ? `<img aria-hidden="true" role="presentation" class="ui image" src="${orgLogo}" />` : "";
            params["orglogomobile"] = orglogomobile ? `<img aria-hidden="true" role="presentation" class="ui image" src="${orglogomobile}" />` : "";
            let ghURLs = d.ghEditURLs || [];
            if (ghURLs.length) {
                let ghText = `<p style="margin-top:1em">\n`;
                let linkLabel = lf("Edit this page on GitHub");
                for (let u of ghURLs) {
                    ghText += `<a href="${u}"><i class="write icon"></i>${linkLabel}</a><br>\n`;
                    linkLabel = lf("Edit template of this page on GitHub");
                }
                ghText += `</p>\n`;
                params["github"] = ghText;
            }
            else {
                params["github"] = "";
            }
            // Add accessiblity menu
            const accMenuHtml = `
            <a href="#maincontent" class="ui item link" tabindex="0" role="menuitem">${lf("Skip to main content")}</a>
        `;
            params['accMenu'] = accMenuHtml;
            const printButtonTitleText = lf("Print this page");
            // Add print button
            const printBtnHtml = `
            <button id="printbtn" class="circular ui icon right floated button hideprint" title="${printButtonTitleText}" aria-label="${printButtonTitleText}">
                <i class="icon print"></i>
            </button>
        `;
            params['printBtn'] = printBtnHtml;
            // Add sidebar toggle
            const sidebarToggleHtml = `
            <a id="togglesidebar" class="launch icon item" tabindex="0" title="Side menu" aria-label="${lf("Side menu")}" role="menuitem" aria-expanded="false">
                <i class="content icon"></i>
            </a>
        `;
            params['sidebarToggle'] = sidebarToggleHtml;
            // Add search bars
            const searchBarIds = ['tocsearch1', 'tocsearch2'];
            const searchBarsHtml = searchBarIds.map((searchBarId) => {
                return `
                <input type="search" name="q" placeholder="${lf("Search...")}" aria-label="${lf("Search Documentation")}">
                <i onclick="document.getElementById('${searchBarId}').submit();" tabindex="0" class="search link icon" aria-label="${lf("Search")}" role="button"></i>
            `;
            });
            params["searchBar1"] = searchBarsHtml[0];
            params["searchBar2"] = searchBarsHtml[1];
            let style = '';
            if (theme.accentColor)
                style += `
.ui.accent { color: ${theme.accentColor}; }
.ui.inverted.accent { background: ${theme.accentColor}; }
`;
            params["targetstyle"] = style;
            params["tocclass"] = theme.lightToc ? "lighttoc" : "inverted";
            for (let k of Object.keys(theme)) {
                let v = theme[k];
                if (params[k] === undefined && typeof v == "string")
                    params[k] = v;
            }
            d.finish = () => injectHtml(d.html, params, [
                "body",
                "menu",
                "accMenu",
                "TOC",
                "prev",
                "next",
                "printBtn",
                "breadcrumb",
                "targetlogo",
                "orglogo",
                "orglogomobile",
                "github",
                "JSON",
                "appstoremeta",
                "sidebarToggle",
                "searchBar1",
                "searchBar2"
            ]);
            // Normalize any path URL with any version path in the current URL
            function normalizeUrl(href) {
                if (!href)
                    return href;
                const relative = href.indexOf('/') == 0;
                if (relative && d.versionPath)
                    href = `/${d.versionPath}${href}`;
                return href;
            }
        }
        docs.prepTemplate = prepTemplate;
        function setupRenderer(renderer) {
            renderer.image = function (href, title, text) {
                let out = '<img class="ui image" src="' + href + '" alt="' + text + '"';
                if (title) {
                    out += ' title="' + title + '"';
                }
                out += ' loading="lazy"';
                out += this.options.xhtml ? '/>' : '>';
                return out;
            };
            renderer.listitem = function (text) {
                const m = /^\s*\[( |x)\]/i.exec(text);
                if (m)
                    return `<li class="${m[1] == ' ' ? 'unchecked' : 'checked'}">` + text.slice(m[0].length) + '</li>\n';
                return '<li>' + text + '</li>\n';
            };
            renderer.heading = function (text, level, raw) {
                let m = /(.*)#([\w\-]+)\s*$/.exec(text);
                let id = "";
                if (m) {
                    text = m[1];
                    id = m[2];
                }
                else {
                    id = raw.toLowerCase().replace(/[^\w]+/g, '-');
                }
                // remove tutorial macros
                if (text)
                    text = text.replace(/@(fullscreen|unplugged|showdialog|showhint)/gi, '');
                return `<h${level} id="${this.options.headerPrefix}${id}">${text}</h${level}>`;
            };
        }
        docs.setupRenderer = setupRenderer;
        function renderConditionalMacros(template, pubinfo) {
            return template
                .replace(/<!--\s*@(ifn?def)\s+(\w+)\s*-->([^]*?)<!--\s*@endif\s*-->/g, (full, cond, sym, inner) => {
                if ((cond == "ifdef" && pubinfo[sym]) || (cond == "ifndef" && !pubinfo[sym]))
                    return `<!-- ${cond} ${sym} -->${inner}<!-- endif -->`;
                else
                    return `<!-- ${cond} ${sym} endif -->`;
            });
        }
        docs.renderConditionalMacros = renderConditionalMacros;
        function renderMarkdown(opts) {
            let hasPubInfo = true;
            if (!opts.pubinfo) {
                hasPubInfo = false;
                opts.pubinfo = {};
            }
            let pubinfo = opts.pubinfo;
            if (!opts.theme)
                opts.theme = {};
            delete opts.pubinfo["private"]; // just in case
            if (pubinfo["time"]) {
                let tm = parseInt(pubinfo["time"]);
                if (!pubinfo["timems"])
                    pubinfo["timems"] = 1000 * tm + "";
                if (!pubinfo["humantime"])
                    pubinfo["humantime"] = U.isoTime(tm);
            }
            if (pubinfo["name"]) {
                pubinfo["dirname"] = pubinfo["name"].replace(/[^A-Za-z0-9_]/g, "-");
                pubinfo["title"] = pubinfo["name"];
            }
            if (hasPubInfo) {
                pubinfo["JSON"] = JSON.stringify(pubinfo, null, 4).replace(/</g, "\\u003c");
            }
            let template = opts.template;
            template = template
                .replace(/<!--\s*@include\s+(\S+)\s*-->/g, (full, fn) => {
                let cont = (opts.theme.htmlDocIncludes || {})[fn] || "";
                return "<!-- include " + fn + " -->\n" + cont + "\n<!-- end include -->\n";
            });
            template = renderConditionalMacros(template, pubinfo);
            if (opts.locale)
                template = translate(template, opts.locale).text;
            let d = {
                html: template,
                theme: opts.theme,
                filepath: opts.filepath,
                versionPath: opts.versionPath,
                ghEditURLs: opts.ghEditURLs,
                params: pubinfo,
                TOC: opts.TOC
            };
            prepTemplate(d);
            if (!markedInstance) {
                markedInstance = docs.requireMarked();
            }
            // We have to re-create the renderer every time to avoid the link() function's closure capturing the opts
            let renderer = new markedInstance.Renderer();
            setupRenderer(renderer);
            const linkRenderer = renderer.link;
            renderer.link = function (href, title, text) {
                const relative = new RegExp('^[/#]').test(href);
                const target = !relative ? '_blank' : '';
                if (relative && d.versionPath)
                    href = `/${d.versionPath}${href}`;
                const html = linkRenderer.call(renderer, href, title, text);
                return html.replace(/^<a /, `<a ${target ? `target="${target}"` : ''} rel="nofollow noopener" `);
            };
            let sanitizer = docs.requireDOMSanitizer();
            markedInstance.setOptions({
                renderer: renderer,
                gfm: true,
                tables: true,
                breaks: false,
                pedantic: false,
                sanitize: true,
                sanitizer: sanitizer,
                smartLists: true,
                smartypants: true
            });
            let markdown = opts.markdown;
            // append repo info if any
            if (opts.repo)
                markdown += `
\`\`\`package
${opts.repo.name.replace(/^pxt-/, '')}=github:${opts.repo.fullName}#${opts.repo.tag || "master"}
\`\`\`
`;
            //Uses the CmdLink definitions to replace links to YouTube and Vimeo (limited at the moment)
            markdown = markdown.replace(/^\s*https?:\/\/(\S+)\s*$/mg, (f, lnk) => {
                for (let ent of links) {
                    let m = ent.rx.exec(lnk);
                    if (m) {
                        return ent.cmd.replace(/\$(\d+)/g, (f, k) => {
                            return m[parseInt(k)] || "";
                        }) + "\n";
                    }
                }
                return f;
            });
            // replace pre-template in markdown
            markdown = markdown.replace(/@([a-z]+)@/ig, (m, param) => {
                let macro = pubinfo[param];
                if (!macro && opts.throwOnError)
                    U.userError(`unknown macro ${param}`);
                return macro || 'unknown macro';
            });
            let html = markedInstance(markdown);
            // support for breaks which somehow don't work out of the box
            html = html.replace(/&lt;br\s*\/&gt;/ig, "<br/>");
            // github will render images if referenced as ![](/docs/static/foo.png)
            // we require /static/foo.png
            html = html.replace(/(<img [^>]* src=")\/docs\/static\/([^">]+)"/g, (f, pref, addr) => pref + '/static/' + addr + '"');
            let endBox = "";
            let boxSize = 0;
            function appendEndBox(size, box, html) {
                let r = html;
                if (size <= boxSize) {
                    r = endBox + r;
                    endBox = "";
                    boxSize = 0;
                }
                return r;
            }
            html = html.replace(/<h(\d)[^>]+>\s*([~@])?\s*(.*?)<\/h\d>/g, (f, lvl, tp, body) => {
                let m = /^(\w+)\s+(.*)/.exec(body);
                let cmd = m ? m[1] : body;
                let args = m ? m[2] : "";
                let rawArgs = args;
                args = html2Quote(args);
                cmd = html2Quote(cmd);
                lvl = parseInt(lvl);
                if (!tp) {
                    return appendEndBox(lvl, endBox, f);
                }
                else if (tp == "@") {
                    let expansion = U.lookup(d.settings, cmd);
                    if (expansion != null) {
                        pubinfo[cmd] = args;
                    }
                    else {
                        expansion = U.lookup(d.macros, cmd);
                        if (expansion == null) {
                            if (opts.throwOnError)
                                U.userError(`Unknown command: @${cmd}`);
                            return error(`Unknown command: @${cmd}`);
                        }
                    }
                    let ivars = {
                        ARGS: args,
                        CMD: cmd
                    };
                    return appendEndBox(lvl, endBox, injectHtml(expansion, ivars, ["ARGS", "CMD"]));
                }
                else {
                    if (!cmd) {
                        let r = endBox;
                        endBox = "";
                        return r;
                    }
                    let box = U.lookup(d.boxes, cmd);
                    if (box) {
                        let parts = box.split("@BODY@");
                        let r = appendEndBox(lvl, endBox, parts[0].replace("@ARGS@", args));
                        endBox = parts[1];
                        let attrs = box.match(/data-[^>\s]+/ig);
                        if (attrs && attrs.indexOf('data-inferred') >= 0) {
                            boxSize = lvl;
                        }
                        return r;
                    }
                    else {
                        if (opts.throwOnError)
                            U.userError(`Unknown box: ~ ${cmd}`);
                        return error(`Unknown box: ~ ${cmd}`);
                    }
                }
            });
            if (endBox)
                html = html + endBox;
            if (!pubinfo["title"]) {
                let titleM = /<h1[^<>]*>([^<>]+)<\/h1>/.exec(html);
                if (titleM)
                    pubinfo["title"] = html2Quote(titleM[1]);
            }
            if (!pubinfo["description"]) {
                let descM = /<p>([^]+?)<\/p>/.exec(html);
                if (descM)
                    pubinfo["description"] = html2Quote(descM[1]);
            }
            // try getting a better custom image for twitter
            const imgM = /<div class="ui embed mdvid"[^<>]+?data-placeholder="([^"]+)"[^>]*\/?>/i.exec(html)
                || /<img class="ui [^"]*image" src="([^"]+)"[^>]*\/?>/i.exec(html);
            if (imgM)
                pubinfo["cardLogo"] = html2Quote(imgM[1]);
            pubinfo["twitter"] = html2Quote(opts.theme.twitter || "@msmakecode");
            let registers = {};
            registers["main"] = ""; // first
            html = html.replace(/<!-- BEGIN-ASIDE (\S+) -->([^]*?)<!-- END-ASIDE -->/g, (f, nam, cont) => {
                let s = U.lookup(registers, nam);
                registers[nam] = (s || "") + cont;
                return "<!-- aside -->";
            });
            // fix up spourious newlines at the end of code blocks
            html = html.replace(/\n<\/code>/g, "</code>");
            registers["main"] = html;
            let injectBody = (tmpl, body) => injectHtml(d.boxes[tmpl] || "@BODY@", { BODY: body }, ["BODY"]);
            html = "";
            for (let k of Object.keys(registers)) {
                html += injectBody(k + "-container", registers[k]);
            }
            pubinfo["body"] = html;
            // don't mangle target name in title, it is already in the sitename
            pubinfo["name"] = pubinfo["title"] || "";
            for (let k of Object.keys(opts.theme)) {
                let v = opts.theme[k];
                if (typeof v == "string")
                    pubinfo["theme_" + k] = v;
            }
            return d.finish();
        }
        docs.renderMarkdown = renderMarkdown;
        function injectHtml(template, vars, quoted = []) {
            if (!template)
                return '';
            return template.replace(/@(\w+)@/g, (f, key) => {
                let res = U.lookup(vars, key) || "";
                res += ""; // make sure it's a string
                if (quoted.indexOf(key) < 0) {
                    res = html2Quote(res);
                }
                return res;
            });
        }
        function embedUrl(rootUrl, tag, id, height) {
            const url = `${rootUrl}#${tag}:${id}`;
            let padding = '70%';
            return `<div style="position:relative;height:0;padding-bottom:${padding};overflow:hidden;"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${url}" frameborder="0" sandbox="allow-popups allow-forms allow-scripts allow-same-origin"></iframe></div>`;
        }
        docs.embedUrl = embedUrl;
        function runUrl(url, padding, id) {
            let embed = `<div style="position:relative;height:0;padding-bottom:${padding};overflow:hidden;"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${url}?id=${encodeURIComponent(id)}" allowfullscreen="allowfullscreen" sandbox="allow-popups allow-forms allow-scripts allow-same-origin" frameborder="0"></iframe></div>`;
            return embed;
        }
        docs.runUrl = runUrl;
        function codeEmbedUrl(rootUrl, id, height) {
            const docurl = `${rootUrl}---codeembed#pub:${id}`;
            height = Math.ceil(height || 300);
            return `<div style="position:relative;height:calc(${height}px + 5em);width:100%;overflow:hidden;"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${docurl}" allowfullscreen="allowfullscreen" frameborder="0" sandbox="allow-scripts allow-same-origin"></iframe></div>`;
        }
        docs.codeEmbedUrl = codeEmbedUrl;
        const inlineTags = {
            b: 1,
            strong: 1,
            em: 1,
        };
        function translate(html, locale) {
            const missing = {};
            function translateOne(toTranslate) {
                let spm = /^(\s*)([^]*?)(\s*)$/.exec(toTranslate);
                let text = spm[2].replace(/\s+/g, " ");
                if (text == "" || /^((IE=edge,.*|width=device-width.*|(https?:\/\/|\/)[\w@\/\.]+|@[\-\w]+@|\{[^\{\}]+\}|[^a-zA-Z]*|(&nbsp;)+)\s*)+$/.test(text))
                    return null;
                let v = U.lookup(locale, text);
                if (v)
                    text = v;
                else
                    missing[text] = "";
                return spm[1] + text + spm[3];
            }
            html = html.replace(/<([\/\w]+)([^<>]*)>/g, (full, tagname, args) => {
                let key = tagname.replace(/^\//, "").toLowerCase();
                if (inlineTags[key] === 1)
                    return "&llt;" + tagname + args + "&ggt;";
                return full;
            });
            function ungt(s) {
                return s.replace(/&llt;/g, "<").replace(/&ggt;/g, ">");
            }
            html = "<start>" + html;
            html = html.replace(/(<([\/\w]+)([^<>]*)>)([^<>]+)/g, (full, fullTag, tagname, args, str) => {
                if (tagname == "script" || tagname == "style")
                    return ungt(full);
                let tr = translateOne(ungt(str));
                if (tr == null)
                    return ungt(full);
                return fullTag + tr;
            });
            html = html.replace(/(<[^<>]*)(content|placeholder|alt|title)="([^"]+)"/g, (full, pref, attr, text) => {
                let tr = translateOne(text);
                if (tr == null)
                    return full;
                return pref + attr + '="' + text.replace(/"/g, "''") + '"';
            });
            html = html.replace(/^<start>/g, "");
            return {
                text: html,
                missing: missing
            };
        }
        docs.translate = translate;
        function lookupSection(template, id) {
            if (template.id == id)
                return template;
            for (let ch of template.children) {
                let r = lookupSection(ch, id);
                if (r)
                    return r;
            }
            return null;
        }
        function splitMdSections(md, template) {
            let lineNo = 0;
            let openSections = [{
                    level: 0,
                    id: "",
                    title: "",
                    start: lineNo,
                    text: "",
                    children: []
                }];
            md = md.replace(/\r/g, "");
            let lines = md.split(/\n/);
            let skipThese = {};
            for (let l of lines) {
                let m = /^\s*(#+)\s*(.*?)(#(\S+)\s*)?$/.exec(l);
                let templSect = null;
                if (template && m) {
                    if (!m[4])
                        m = null;
                    else if (skipThese[m[4]])
                        m = null;
                    else {
                        templSect = lookupSection(template, m[4]);
                        let skip = (s) => {
                            if (s.id)
                                skipThese[s.id] = true;
                            s.children.forEach(skip);
                        };
                        if (templSect)
                            skip(templSect);
                    }
                }
                if (m) {
                    let level = template ? 1 : m[1].length;
                    let s = {
                        level: level,
                        title: m[2].trim(),
                        id: m[4] || "",
                        start: lineNo,
                        text: "",
                        children: []
                    };
                    if (templSect) {
                        l = "";
                        for (let i = 0; i < templSect.level; ++i)
                            l += "#";
                        l += " ";
                        l += s.title || templSect.title;
                        l += " #" + s.id;
                    }
                    while (openSections[openSections.length - 1].level >= s.level)
                        openSections.pop();
                    let parent = openSections[openSections.length - 1];
                    parent.children.push(s);
                    openSections.push(s);
                }
                openSections[openSections.length - 1].text += l + "\n";
                lineNo++;
            }
            return openSections[0];
        }
        function buildTOC(summaryMD) {
            if (!summaryMD)
                return null;
            const markedInstance = pxt.docs.requireMarked();
            const sanitizer = docs.requireDOMSanitizer();
            const options = {
                renderer: new markedInstance.Renderer(),
                gfm: true,
                tables: false,
                breaks: false,
                pedantic: false,
                sanitize: true,
                sanitizer: sanitizer,
                smartLists: false,
                smartypants: false
            };
            let dummy = { name: 'dummy', subitems: [] };
            let currentStack = [];
            currentStack.push(dummy);
            let tokens = markedInstance.lexer(summaryMD, options);
            let wasListStart = false;
            tokens.forEach((token) => {
                switch (token.type) {
                    case "heading":
                        if (token.depth == 3) {
                            // heading
                        }
                        break;
                    case "list_start":
                        break;
                    case "list_item_start":
                    case "loose_item_start":
                        wasListStart = true;
                        let newItem = {
                            name: '',
                            path: '',
                            subitems: []
                        };
                        currentStack.push(newItem);
                        return;
                    case "text":
                        let lastTocEntry = currentStack[currentStack.length - 1];
                        if (token.text.indexOf("[") >= 0) {
                            token.text.replace(/\[(.*?)\]\((.*?)\)/i, function (full, name, path) {
                                lastTocEntry.name = name;
                                lastTocEntry.path = path.replace('.md', '');
                            });
                        }
                        else if (wasListStart) {
                            lastTocEntry.name = token.text;
                        }
                        break;
                    case "list_item_end":
                    case "loose_item_end":
                        let docEntry = currentStack.pop();
                        currentStack[currentStack.length - 1].subitems.push(docEntry);
                        break;
                    case "list_end":
                        break;
                    default:
                }
                wasListStart = false;
            });
            let TOC = dummy.subitems;
            if (!TOC || TOC.length == 0)
                return null;
            return TOC;
        }
        docs.buildTOC = buildTOC;
        function visitTOC(toc, fn) {
            function visitEntry(entry) {
                fn(entry);
                if (entry.subitems)
                    entry.subitems.forEach(fn);
            }
            toc.forEach(visitEntry);
        }
        docs.visitTOC = visitTOC;
        let testedAugment = false;
        function augmentDocs(baseMd, childMd) {
            if (!testedAugment)
                testAugment();
            if (!childMd)
                return baseMd;
            let templ = splitMdSections(baseMd, null);
            let repl = splitMdSections(childMd, templ);
            let lookup = {};
            let used = {};
            for (let ch of repl.children) {
                U.assert(ch.children.length == 0);
                U.assert(!!ch.id);
                lookup[ch.id] = ch.text;
            }
            let replaceInTree = (s) => {
                if (s.id && lookup[s.id] !== undefined) {
                    used[s.id] = true;
                    s.text = lookup[s.id];
                    s.children = [];
                }
                s.children.forEach(replaceInTree);
            };
            replaceInTree(templ);
            let resMd = "";
            let flatten = (s) => {
                resMd += s.text;
                s.children.forEach(flatten);
            };
            flatten(templ);
            let leftover = "";
            let hd = repl.text
                .replace(/^\s*#+\s*@extends.*/mg, "")
                .replace(/^\s*\n/mg, "");
            if (hd.trim())
                leftover += hd.trim() + "\n";
            for (let s of repl.children) {
                if (!used[s.id])
                    leftover += s.text;
            }
            if (leftover) {
                resMd += "## Couldn't apply replacement logic to:\n" + leftover;
            }
            return resMd;
        }
        docs.augmentDocs = augmentDocs;
        function testAugment() {
            function test(a, b, c) {
                let r = augmentDocs(a, b).trim();
                c = c.trim();
                if (r != c) {
                    console.log(`*** Template:\n${a}\n*** Input:\n${b}\n*** Expected:\n${c}\n*** Output:\n${r}`);
                    throw new Error("augment docs test fail");
                }
            }
            testedAugment = true;
            let templ0 = `
# T0
## Examples #ex
### Example 1
TEx1
### Example 2 #ex2
TEx2
### Example 3
TEx3

## See also #also
TAlso
`;
            let inp0 = `
# @extends
# #ex2
My example
## See Also These! #also
My links
`;
            let outp0 = `
# T0
## Examples #ex
### Example 1
TEx1
### Example 2 #ex2
My example
### Example 3
TEx3

## See Also These! #also
My links
`;
            let inp1 = `
# @extends
### #ex
Foo
#### Example 1
Ex1
#### Example 2x #ex2
Ex2
## See Also These! #also
My links
`;
            let outp1 = `
# T0
## Examples #ex
Foo
#### Example 1
Ex1
#### Example 2x #ex2
Ex2
## See Also These! #also
My links
`;
            test(templ0, "", templ0);
            test(templ0, " ", templ0);
            test(templ0, inp0, outp0);
            test(templ0, inp1, outp1);
        }
    })(docs = pxt.docs || (pxt.docs = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var dom;
    (function (dom) {
        function el(name, attributes, children) {
            const el = document.createElement(name);
            if (attributes)
                Object.keys(attributes).forEach(k => el.setAttribute(k, attributes[k] + ""));
            appendChild(children);
            return el;
            function appendChild(c) {
                if (Array.isArray(c))
                    c.forEach(cc => appendChild(cc));
                else if (typeof c === "string")
                    el.appendChild(document.createTextNode(c));
                else if (c instanceof HTMLElement)
                    el.appendChild(c);
            }
        }
        dom.el = el;
    })(dom = pxt.dom || (pxt.dom = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var gallery;
    (function (gallery_1) {
        function parsePackagesFromMarkdown(md) {
            const pm = /```package\s+((.|\s)+?)\s*```/i.exec(md);
            let dependencies = undefined;
            if (pm) {
                dependencies = {};
                pm[1].split('\n').map(s => s.replace(/\s*/g, '')).filter(s => !!s)
                    .map(l => l.split('='))
                    .forEach(kv => dependencies[kv[0]] = kv[1] || "*");
            }
            return dependencies;
        }
        gallery_1.parsePackagesFromMarkdown = parsePackagesFromMarkdown;
        function parseFeaturesFromMarkdown(md) {
            const pm = /```config\s+((.|\s)+?)\s*```/i.exec(md);
            let features = [];
            if (pm) {
                pm[1].split('\n').map(s => s.replace(/\s*/g, '')).filter(s => !!s)
                    .map(l => l.split('='))
                    .filter(kv => kv[0] == "feature" && !!kv[1])
                    .forEach(kv => features.push(kv[1]));
            }
            return features.length ? features : undefined;
        }
        gallery_1.parseFeaturesFromMarkdown = parseFeaturesFromMarkdown;
        function parseJResFromMarkdown(md) {
            const pm = /```jres\s+((.|\s)+?)\s*```/i.exec(md);
            if (pm) {
                const jres = pm[1];
                const parsed = JSON.parse(jres);
                return {
                    jres,
                    ts: pxt.emitTilemapsFromJRes(parsed)
                };
            }
            return undefined;
        }
        gallery_1.parseJResFromMarkdown = parseJResFromMarkdown;
        function parseTemplateProjectJSON(md) {
            const pm = /```assetjson\s+((.|\s)+?)\s*```/i.exec(md);
            if (pm) {
                return pxt.tutorial.parseAssetJson(pm[1]);
            }
            return {};
        }
        gallery_1.parseTemplateProjectJSON = parseTemplateProjectJSON;
        function parseExampleMarkdown(name, md) {
            if (!md)
                return undefined;
            const m = /```(blocks?|typescript|python|spy|sim)\s+((.|\s)+?)\s*```/i.exec(md);
            if (!m)
                return undefined;
            const dependencies = parsePackagesFromMarkdown(md);
            const snippetType = m[1];
            const source = m[2];
            const features = parseFeaturesFromMarkdown(md);
            const jres = parseJResFromMarkdown(md);
            const prj = {
                name,
                filesOverride: {
                    [pxt.MAIN_BLOCKS]: `<xml xmlns="http://www.w3.org/1999/xhtml"></xml>`,
                    [m[1] === "python" ? pxt.MAIN_PY : pxt.MAIN_TS]: source
                },
                dependencies,
                features,
                snippetType,
                source
            };
            prj.filesOverride = Object.assign(Object.assign({}, prj.filesOverride), parseTemplateProjectJSON(md));
            if (jres) {
                prj.filesOverride[pxt.TILEMAP_JRES] = jres.jres;
                prj.filesOverride[pxt.TILEMAP_CODE] = jres.ts;
            }
            return prj;
        }
        gallery_1.parseExampleMarkdown = parseExampleMarkdown;
        function parseCodeCards(md) {
            // try to parse code cards as JSON
            let cards = pxt.Util.jsonTryParse(md);
            if (cards && !Array.isArray(cards))
                cards = [cards];
            if (cards === null || cards === void 0 ? void 0 : cards.length)
                return cards;
            // not json, try parsing as sequence of key,value pairs, with line splits
            cards = md.split(/^---$/gm)
                .filter(cmd => !!cmd)
                .map(cmd => {
                let cc = {};
                cmd.replace(/^\s*(?:-|\*)\s+(\w+)\s*:\s*(.*)$/gm, (m, n, v) => {
                    if (n == "flags")
                        cc[n] = v.split(',');
                    else if (n === "otherAction") {
                        const parts = v.split(',').map((p) => p === null || p === void 0 ? void 0 : p.trim());
                        const oas = (cc["otherActions"] || (cc["otherActions"] = []));
                        oas.push({
                            url: parts[0],
                            editor: parts[1],
                            cardType: parts[2]
                        });
                    }
                    else
                        cc[n] = v;
                    return '';
                });
                return !!Object.keys(cc).length && cc;
            })
                .filter(cc => !!cc);
            if (cards === null || cards === void 0 ? void 0 : cards.length)
                return cards;
            return undefined;
        }
        gallery_1.parseCodeCards = parseCodeCards;
        function parseCodeCardsHtml(el) {
            let cards = [];
            // if there are UL/OL elements under el, it's the new format
            let card;
            Array.from(el.children)
                .forEach(child => {
                if (child.tagName === "UL" || child.tagName === "OL") {
                    if (!card)
                        card = {};
                    // read fields into card
                    Array.from(child.querySelectorAll("li"))
                        .forEach(field => {
                        const text = field.innerText;
                        const m = /^\s*(\w+)\s*:\s*(.*)$/.exec(text);
                        if (m) {
                            const k = m[1];
                            card[k] = m[2].trim();
                            if (k === "flags")
                                card[k] = card[k].split(/,\s*/);
                        }
                    });
                }
                else if (child.tagName == "HR") {
                    // flush current card
                    if (card)
                        cards.push(card);
                    card = undefined;
                }
            });
            // flush last card
            if (card)
                cards.push(card);
            // try older format
            if (cards.length === 0 && el.tagName === "CODE") {
                // legacy JSON format
                cards = pxt.Util.jsonTryParse(el.textContent);
            }
            return !!(cards === null || cards === void 0 ? void 0 : cards.length) && cards;
        }
        gallery_1.parseCodeCardsHtml = parseCodeCardsHtml;
        function parseGalleryMardown(md) {
            if (!md)
                return [];
            // second level titles are categories
            // ## foo bar
            // fenced code ```cards are sections of cards
            const galleries = [];
            let incard = false;
            let name = undefined;
            let cardsSource = "";
            md.split(/\r?\n/).forEach(line => {
                // new category
                if (/^## /.test(line)) {
                    name = line.substr(2).trim();
                }
                else if (/^(### ~ |```)codecard$/.test(line)) {
                    incard = true;
                }
                else if (/^(### ~|```)$/.test(line)) {
                    incard = false;
                    if (name && cardsSource) {
                        const cards = parseCodeCards(cardsSource);
                        if (cards === null || cards === void 0 ? void 0 : cards.length)
                            galleries.push({ name, cards });
                        else
                            pxt.log(`invalid gallery format`);
                    }
                    cardsSource = "";
                    name = undefined;
                }
                else if (incard)
                    cardsSource += line + '\n';
            });
            // apply transformations
            galleries.forEach(gallery => gallery.cards.forEach(card => {
                if (card.otherActions && !card.otherActions.length
                    && (card.cardType == "tutorial" || card.cardType == "example")) {
                    const editors = ["js"];
                    if (pxt.appTarget.appTheme.python)
                        editors.unshift("py");
                    card.otherActions = editors.map((editor) => ({
                        url: card.url,
                        cardType: card.cardType,
                        editor
                    }));
                }
            }));
            return galleries;
        }
        gallery_1.parseGalleryMardown = parseGalleryMardown;
        function loadGalleryAsync(name) {
            return pxt.Cloud.markdownAsync(name)
                .then(md => parseGalleryMardown(md));
        }
        gallery_1.loadGalleryAsync = loadGalleryAsync;
        function codeCardsToMarkdown(cards) {
            const md = `### ~ codecard

${(cards || []).map(card => Object.keys(card)
                .filter(k => !!card[k])
                .map(k => k === "otherActions"
                ? otherActionsToMd(card[k])
                : `* ${k}: ${card[k]}`).join('\n'))
                .join(`

---

`)}

### ~
`;
            return md;
            function otherActionsToMd(oas) {
                return oas.map(oa => `* otherAction: ${oa.url}, ${oa.editor || ""}, ${oa.cardType || ""}`)
                    .join('\n');
            }
        }
        gallery_1.codeCardsToMarkdown = codeCardsToMarkdown;
    })(gallery = pxt.gallery || (pxt.gallery = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    function hex2(n) {
        return ("0" + n.toString(16)).slice(-2);
    }
    function hex2str(h) {
        return pxt.U.uint8ArrayToString(pxt.U.fromHex(h));
    }
    function str2hex(h) {
        return pxt.U.toHex(pxt.U.stringToUint8Array(h));
    }
    class GDBServer {
        constructor(io) {
            this.io = io;
            this.q = new pxt.U.PromiseQueue();
            this.dataBuf = "";
            this.numSent = 0;
            this.pktSize = 400;
            this.trace = false;
            this.bmpMode = true;
            this.targetInfo = "";
            this.onEvent = (s) => { };
            this.io.onData = b => this.onData(b);
        }
        onData(buf) {
            this.dataBuf += pxt.U.uint8ArrayToString(buf);
            while (this.dataBuf.length > 0) {
                let ch = this.dataBuf[0];
                if (ch == '+')
                    this.dataBuf = this.dataBuf.slice(1);
                else if (ch == '$' || ch == '%') {
                    let resp = this.decodeResp(this.dataBuf.slice(1));
                    if (resp != null) {
                        if (ch == '$') {
                            this.io.sendPacketAsync(this.buildCmd("+"));
                            if (this.onResponse)
                                this.onResponse(resp);
                            else {
                                // ignore unexpected responses right after connection
                                // they are likely left-over from a previous session
                                if (this.numSent > 0)
                                    this.io.error("unexpected response: " + resp);
                            }
                        }
                        else {
                            this.onEvent(resp);
                        }
                    }
                    else {
                        break;
                    }
                }
                else {
                    this.io.error("invalid character: " + ch);
                }
            }
        }
        buildCmd(cmd) {
            if (cmd == "+")
                return pxt.U.stringToUint8Array(cmd);
            let r = "";
            for (let i = 0; i < cmd.length; ++i) {
                let ch = cmd.charAt(i);
                if (ch == '}' || ch == '#' || ch == '$') {
                    r += '}';
                    r += String.fromCharCode(ch.charCodeAt(0) ^ 0x20);
                }
                else {
                    r += ch;
                }
            }
            let ch = 0;
            cmd = r;
            for (let i = 0; i < cmd.length; ++i) {
                ch = (ch + cmd.charCodeAt(i)) & 0xff;
            }
            r = "$" + cmd + "#" + hex2(ch);
            return pxt.U.stringToUint8Array(r);
        }
        decodeResp(resp) {
            let r = "";
            for (let i = 0; i < resp.length; ++i) {
                let ch = resp[i];
                if (ch == '}') {
                    ++i;
                    r += String.fromCharCode(resp.charCodeAt(i) ^ 0x20);
                }
                else if (ch == '*') {
                    ++i;
                    let rep = resp.charCodeAt(i) - 29;
                    let ch = r.charAt(r.length - 1);
                    while (rep-- > 0)
                        r += ch;
                }
                else if (ch == '#') {
                    let checksum = resp.slice(i + 1, i + 3);
                    if (checksum.length == 2) {
                        // TODO validate checksum?
                        this.dataBuf = resp.slice(i + 3);
                        return r;
                    }
                    else {
                        // incomplete
                        return null;
                    }
                }
                else {
                    r += ch;
                }
            }
            return null;
        }
        sendCmdOKAsync(cmd) {
            return this.sendCmdAsync(cmd, r => r == "OK");
        }
        error(msg) {
            this.io.error(msg);
            this.io.disconnectAsync();
        }
        sendCmdAsync(cmd, respTest) {
            this.numSent++;
            const cmd2 = this.buildCmd(cmd);
            return this.q.enqueue("one", () => respTest === null ? this.io.sendPacketAsync(cmd2).then(() => null) :
                new Promise((resolve) => {
                    this.onResponse = v => {
                        this.onResponse = null;
                        if (this.trace)
                            pxt.log(`GDB: '${cmd}' -> '${v}'`);
                        if (respTest !== undefined && !respTest(v))
                            this.error(`Invalid GDB command response: '${cmd}' -> '${v}'`);
                        resolve(v);
                    };
                    this.io.sendPacketAsync(cmd2);
                }));
        }
        sendRCmdAsync(cmd) {
            return this.sendMCmdAsync("qRcmd," + str2hex(cmd));
        }
        sendMCmdAsync(cmd) {
            this.numSent++;
            const cmd2 = this.buildCmd(cmd);
            let r = "";
            return this.q.enqueue("one", () => new Promise((resolve) => {
                this.onResponse = v => {
                    if (v != "OK" && v[0] == "O")
                        r += hex2str(v.slice(1));
                    else {
                        if (v != "OK")
                            r += " - " + v;
                        this.onResponse = null;
                        if (this.trace)
                            pxt.log(`Final GDB: '${cmd}' -> '${r}'`);
                        resolve(r);
                    }
                };
                this.io.sendPacketAsync(cmd2);
            }));
        }
        write32Async(addr, data) {
            let b = new Uint8Array(4);
            pxt.HF2.write32(b, 0, data);
            return this.writeMemAsync(addr, b);
        }
        writeMemAsync(addr, data) {
            const maxBytes = this.pktSize / 2 - 10;
            pxt.U.assert(data.length < maxBytes);
            return this.sendCmdOKAsync("M" + addr.toString(16) + "," +
                data.length.toString(16) + ":" + pxt.U.toHex(data))
                .then(r => {
                console.log(r);
            });
        }
        readMemAsync(addr, bytes) {
            const maxBytes = this.pktSize / 2 - 6;
            if (bytes > maxBytes) {
                const result = new Uint8Array(bytes);
                const loop = (ptr) => {
                    const len = Math.min(bytes - ptr, maxBytes);
                    if (len == 0)
                        return Promise.resolve(result);
                    return this.readMemAsync(addr + ptr, len)
                        .then(part => {
                        pxt.U.memcpy(result, ptr, part);
                        return loop(ptr + len);
                    });
                };
                return loop(0);
            }
            return this.sendCmdAsync("m" + addr.toString(16) + "," + bytes.toString(16))
                .then(res => pxt.U.fromHex(res));
        }
        initBMPAsync() {
            return Promise.resolve()
                .then(() => this.sendRCmdAsync("swdp_scan"))
                .then(r => {
                this.targetInfo = r;
                return this.sendCmdAsync("vAttach;1", r => r[0] == "T");
            })
                .then(() => { });
        }
        initAsync() {
            return pxt.U.delay(1000)
                .then(() => this.sendCmdAsync("!")) // extended mode
                .then(() => this.sendCmdAsync("qSupported"))
                .then(res => {
                let features = {};
                res = ";" + res + ";";
                res = res
                    .replace(/;([^;]+)[=:]([^:;]+)/g, (f, k, v) => {
                    features[k] = v;
                    return ";";
                });
                this.pktSize = parseInt(features["PacketSize"]) || 1024;
                pxt.log("GDB-server caps: " + JSON.stringify(features)
                    + " " + res.replace(/;+/g, ";"));
                if (this.bmpMode)
                    return this.initBMPAsync();
                else {
                    // continue
                    return this.sendCmdAsync("c")
                        .then(() => { });
                }
                // return this.sendCmdAsync("?") // reason for stop
            });
        }
    }
    pxt.GDBServer = GDBServer;
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var github;
    (function (github) {
        github.token = null;
        github.forceProxy = false;
        function hasProxy() {
            var _a, _b;
            if (github.forceProxy)
                return true;
            if (pxt.U.isNodeJS)
                return false; // bypass proxy for CLI
            if ((_b = (_a = pxt === null || pxt === void 0 ? void 0 : pxt.appTarget) === null || _a === void 0 ? void 0 : _a.cloud) === null || _b === void 0 ? void 0 : _b.noGithubProxy)
                return false; // target requests no proxy
            return true;
        }
        function shouldUseProxy(force) {
            if (github.forceProxy)
                return true;
            if (github.token && !force)
                return false;
            return hasProxy();
        }
        const isPrivateRepoCache = {};
        function ghRequestAsync(options) {
            var _a;
            options.method = (_a = options.method) !== null && _a !== void 0 ? _a : "GET";
            // call github request with existing token
            // if the request fails and the token is clear, try again with the token
            return workAsync(!!github.token);
            function workAsync(canRetry) {
                var _a;
                const opts = pxt.U.clone(options);
                if (github.token) {
                    if (!opts.headers)
                        opts.headers = {};
                    if (opts.url == GRAPHQL_URL)
                        opts.headers['Authorization'] = `bearer ${github.token}`;
                    else {
                        // defeat browser cache when signed in
                        opts.url = pxt.BrowserUtils.cacheBustingUrl(opts.url);
                        opts.headers['Authorization'] = `token ${github.token}`;
                    }
                }
                opts.allowHttpErrors = (_a = opts.allowHttpErrors) !== null && _a !== void 0 ? _a : false;
                return pxt.U.requestAsync(opts)
                    .catch(e => {
                    pxt.tickEvent("github.error", { statusCode: e.statusCode });
                    if (github.handleGithubNetworkError) {
                        const retry = github.handleGithubNetworkError(opts, e);
                        // retry if it may fix the issue
                        if (retry)
                            return workAsync(false);
                    }
                    throw e;
                });
            }
        }
        function ghGetJsonAsync(url) {
            return ghRequestAsync({ url, method: "GET" }).then(resp => resp.json);
        }
        function ghProxyWithCdnJsonAsync(path) {
            return pxt.Cloud.apiRequestWithCdnAsync({
                url: "gh/" + path,
                forceLiveEndpoint: true
            }).then(r => r.json);
        }
        function ghProxyHandleException(e) {
            pxt.log(`github proxy error: ${e.message}`);
            pxt.debug(e);
        }
        function isOrgAsync(owner) {
            return ghRequestAsync({ url: `https://api.github.com/orgs/${owner}`, method: "GET", allowHttpErrors: true })
                .then(resp => resp.statusCode == 200);
        }
        github.isOrgAsync = isOrgAsync;
        class MemoryGithubDb {
            constructor() {
                this.configs = {};
                this.packages = {};
            }
            proxyWithCdnLoadPackageAsync(repopath, tag) {
                // cache lookup
                const key = `${repopath}/${tag}`;
                let res = this.packages[key];
                if (res) {
                    pxt.debug(`github cache ${repopath}/${tag}/text`);
                    return Promise.resolve(res);
                }
                // load and cache
                const parsed = parseRepoId(repopath);
                return ghProxyWithCdnJsonAsync(join(parsed.slug, tag, parsed.fileName, "text"))
                    .then(v => this.packages[key] = { files: v });
            }
            cacheConfig(key, v) {
                const cfg = pxt.Package.parseAndValidConfig(v);
                this.configs[key] = cfg;
                return pxt.U.clone(cfg);
            }
            async loadConfigAsync(repopath, tag) {
                if (!tag)
                    tag = "master";
                // cache lookup
                const key = `${repopath}/${tag}`;
                let res = this.configs[key];
                if (res) {
                    pxt.debug(`github cache ${repopath}/${tag}/config`);
                    return pxt.U.clone(res);
                }
                // download and cache
                // try proxy if available
                if (hasProxy()) {
                    try {
                        const gpkg = await this.proxyWithCdnLoadPackageAsync(repopath, tag);
                        return this.cacheConfig(key, gpkg.files[pxt.CONFIG_NAME]);
                    }
                    catch (e) {
                        ghProxyHandleException(e);
                    }
                }
                // if failed, try github apis
                const cfg = await downloadTextAsync(repopath, tag, pxt.CONFIG_NAME);
                return this.cacheConfig(key, cfg);
            }
            async loadPackageAsync(repopath, tag) {
                if (!tag)
                    tag = "master";
                // try using github proxy first
                if (hasProxy()) {
                    try {
                        return await this.proxyWithCdnLoadPackageAsync(repopath, tag).then(v => pxt.U.clone(v));
                    }
                    catch (e) {
                        ghProxyHandleException(e);
                    }
                }
                // try using github apis
                return await this.githubLoadPackageAsync(repopath, tag);
            }
            githubLoadPackageAsync(repopath, tag) {
                return tagToShaAsync(repopath, tag)
                    .then(sha => {
                    // cache lookup
                    const key = `${repopath}/${sha}`;
                    let res = this.packages[key];
                    if (res) {
                        pxt.debug(`github cache ${repopath}/${tag}/text`);
                        return Promise.resolve(pxt.U.clone(res));
                    }
                    // load and cache
                    pxt.log(`Downloading ${repopath}/${tag} -> ${sha}`);
                    return downloadTextAsync(repopath, sha, pxt.CONFIG_NAME)
                        .then(pkg => {
                        const current = {
                            files: {}
                        };
                        current.files[pxt.CONFIG_NAME] = pkg;
                        const cfg = JSON.parse(pkg);
                        return pxt.U.promiseMapAll(pxt.allPkgFiles(cfg).slice(1), fn => downloadTextAsync(repopath, sha, fn)
                            .then(text => {
                            current.files[fn] = text;
                        }))
                            .then(() => {
                            // cache!
                            this.packages[key] = current;
                            return pxt.U.clone(current);
                        });
                    });
                });
            }
        }
        github.MemoryGithubDb = MemoryGithubDb;
        function fallbackDownloadTextAsync(parsed, commitid, filepath) {
            return ghRequestAsync({
                url: "https://api.github.com/repos/" + join(parsed.slug, "contents", parsed.fileName, filepath + "?ref=" + commitid),
                method: "GET"
            }).then(resp => {
                const f = resp.json;
                isPrivateRepoCache[parsed.slug] = true;
                // if they give us content, just return it
                if (f && f.encoding == "base64" && f.content != null)
                    return atob(f.content);
                // otherwise, go to download URL
                return pxt.U.httpGetTextAsync(f.download_url);
            });
        }
        function downloadTextAsync(repopath, commitid, filepath) {
            const parsed = parseRepoId(repopath);
            // raw.githubusercontent.com doesn't accept ?access_token=... and has wrong CORS settings
            // for Authorization: header; so try anonymous access first, and otherwise fetch using API
            if (isPrivateRepoCache[parsed.slug])
                return fallbackDownloadTextAsync(parsed, commitid, filepath);
            return pxt.U.requestAsync({
                url: "https://raw.githubusercontent.com/" + join(parsed.slug, commitid, parsed.fileName, filepath),
                allowHttpErrors: true
            }).then(resp => {
                if (resp.statusCode == 200)
                    return resp.text;
                return fallbackDownloadTextAsync(parsed, commitid, filepath);
            });
        }
        github.downloadTextAsync = downloadTextAsync;
        // overriden by client
        github.db = new MemoryGithubDb();
        function authenticatedUserAsync() {
            if (!github.token)
                return Promise.resolve(undefined); // no token, bail out
            return ghGetJsonAsync("https://api.github.com/user");
        }
        github.authenticatedUserAsync = authenticatedUserAsync;
        function getCommitsAsync(repopath, sha) {
            const parsed = parseRepoId(repopath);
            return ghGetJsonAsync("https://api.github.com/repos/" + parsed.slug + "/commits?sha=" + sha)
                .then(objs => objs.map((obj) => {
                const c = obj.commit;
                c.url = obj.url;
                c.sha = obj.sha;
                return c;
            }));
        }
        github.getCommitsAsync = getCommitsAsync;
        function getCommitAsync(repopath, sha) {
            const parsed = parseRepoId(repopath);
            return ghGetJsonAsync("https://api.github.com/repos/" + parsed.slug + "/git/commits/" + sha)
                .then((commit) => ghGetJsonAsync(commit.tree.url + "?recursive=1")
                .then((tree) => {
                commit.tree = tree;
                return commit;
            }));
        }
        github.getCommitAsync = getCommitAsync;
        function ghPostAsync(path, data, headers, method) {
            // need to handle 204
            return ghRequestAsync({
                url: /^https:/.test(path) ? path : "https://api.github.com/repos/" + path,
                headers,
                method: method || "POST",
                data: data,
                successCodes: [200, 201, 202, 204]
            }).then(resp => resp.json);
        }
        function createObjectAsync(repopath, type, data) {
            const parsed = parseRepoId(repopath);
            return ghPostAsync(parsed.slug + "/git/" + type + "s", data)
                .then((resp) => resp.sha);
        }
        github.createObjectAsync = createObjectAsync;
        function postCommitComment(repopath, commitSha, body, path, position) {
            const parsed = parseRepoId(repopath);
            return ghPostAsync(`${parsed.slug}/commits/${commitSha}/comments`, {
                body, path, position
            })
                .then((resp) => resp.id);
        }
        github.postCommitComment = postCommitComment;
        async function fastForwardAsync(repopath, branch, commitid) {
            const parsed = parseRepoId(repopath);
            const resp = await ghRequestAsync({
                url: `https://api.github.com/repos/${parsed.slug}/git/refs/heads/${branch}`,
                method: "PATCH",
                allowHttpErrors: true,
                data: {
                    sha: commitid,
                    force: false
                }
            });
            return (resp.statusCode == 200);
        }
        github.fastForwardAsync = fastForwardAsync;
        async function putFileAsync(repopath, path, content) {
            const parsed = parseRepoId(repopath);
            await ghRequestAsync({
                url: `https://api.github.com/repos/${pxt.github.join(parsed.slug, "contents", parsed.fileName, path)}`,
                method: "PUT",
                allowHttpErrors: true,
                data: {
                    message: lf("Initialize empty repo"),
                    content: btoa(pxt.U.toUTF8(content)),
                    branch: "master"
                },
                successCodes: [201]
            });
        }
        github.putFileAsync = putFileAsync;
        async function createTagAsync(repopath, tag, commitid) {
            await ghPostAsync(repopath + "/git/refs", {
                ref: "refs/tags/" + tag,
                sha: commitid
            });
        }
        github.createTagAsync = createTagAsync;
        async function createReleaseAsync(repopath, tag, commitid) {
            await ghPostAsync(repopath + "/releases", {
                tag_name: tag,
                target_commitish: commitid,
                name: tag,
                draft: false,
                prerelease: false
            });
        }
        github.createReleaseAsync = createReleaseAsync;
        async function createPRFromBranchAsync(repopath, baseBranch, headBranch, title, msg) {
            const res = await ghPostAsync(repopath + "/pulls", {
                title: title,
                body: msg || lf("Automatically created from MakeCode."),
                head: headBranch,
                base: baseBranch,
                maintainer_can_modify: true
            });
            return res === null || res === void 0 ? void 0 : res.html_url;
        }
        github.createPRFromBranchAsync = createPRFromBranchAsync;
        function mergeAsync(repopath, base, head, message) {
            const parsed = parseRepoId(repopath);
            return ghRequestAsync({
                url: `https://api.github.com/repos/${parsed.slug}/merges`,
                method: "POST",
                successCodes: [201, 204, 409],
                data: {
                    base,
                    head,
                    commit_message: message
                }
            }).then(resp => {
                if (resp.statusCode == 201 || resp.statusCode == 204)
                    return resp.json.sha;
                if (resp.statusCode == 409) {
                    // conflict
                    return null;
                }
                throw pxt.U.userError(lf("Cannot merge in github.com/{1}; code: {2}", repopath, resp.statusCode));
            });
        }
        github.mergeAsync = mergeAsync;
        function getRefAsync(repopath, branch) {
            branch = branch || "master";
            return ghGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/heads/" + branch)
                .then(resolveRefAsync)
                .catch(err => {
                if (err.statusCode == 404)
                    return undefined;
                else
                    Promise.reject(err);
            });
        }
        github.getRefAsync = getRefAsync;
        function generateNextRefName(res, pref) {
            let n = 1;
            while (res.refs[pref + n])
                n++;
            return pref + n;
        }
        async function getNewBranchNameAsync(repopath, pref = "patch-") {
            const res = await listRefsExtAsync(repopath, "heads");
            return generateNextRefName(res, pref);
        }
        github.getNewBranchNameAsync = getNewBranchNameAsync;
        async function createNewBranchAsync(repopath, branchName, commitid) {
            await ghPostAsync(repopath + "/git/refs", {
                ref: "refs/heads/" + branchName,
                sha: commitid
            });
            return branchName;
        }
        github.createNewBranchAsync = createNewBranchAsync;
        async function forkRepoAsync(repopath, commitid, pref = "pr-") {
            const parsed = parseRepoId(repopath);
            const res = await ghPostAsync(`${parsed.slug}/forks`, {});
            const repoInfo = mkRepo(res, { fullName: parsed.fullName, fileName: parsed.fileName });
            const endTm = Date.now() + 5 * 60 * 1000;
            let refs = null;
            while (!refs && Date.now() < endTm) {
                await pxt.U.delay(1000);
                try {
                    refs = await listRefsExtAsync(repoInfo.slug, "heads");
                }
                catch (err) {
                    // not created
                }
            }
            if (!refs)
                throw new Error(lf("Timeout waiting for fork"));
            const branchName = generateNextRefName(refs, pref);
            await createNewBranchAsync(repoInfo.slug, branchName, commitid);
            return repoInfo.fullName + "#" + branchName;
        }
        github.forkRepoAsync = forkRepoAsync;
        function listRefsAsync(repopath, namespace = "tags", useProxy, noCache) {
            return listRefsExtAsync(repopath, namespace, useProxy, noCache)
                .then(res => Object.keys(res.refs));
        }
        github.listRefsAsync = listRefsAsync;
        function listRefsExtAsync(repopath, namespace = "tags", useProxy, noCache) {
            const parsed = parseRepoId(repopath);
            const proxy = shouldUseProxy(useProxy);
            let head = null;
            const fetch = !proxy ?
                ghGetJsonAsync(`https://api.github.com/repos/${parsed.slug}/git/refs/${namespace}/?per_page=100`) :
                // no CDN caching here, bust browser cace
                pxt.U.httpGetJsonAsync(pxt.BrowserUtils.cacheBustingUrl(`${pxt.Cloud.apiRoot}gh/${parsed.slug}/refs${noCache ? "?nocache=1" : ""}`))
                    .then(r => {
                    let res = Object.keys(r.refs)
                        .filter(k => pxt.U.startsWith(k, "refs/" + namespace + "/"))
                        .map(k => ({ ref: k, object: { sha: r.refs[k] } }));
                    head = r.refs["HEAD"];
                    return res;
                });
            let clean = (x) => x.replace(/^refs\/[^\/]+\//, "");
            return fetch.then((resp) => {
                resp.sort((a, b) => pxt.semver.strcmp(clean(a.ref), clean(b.ref)));
                let r = {};
                for (let obj of resp) {
                    r[clean(obj.ref)] = obj.object.sha;
                }
                return { refs: r, head };
            }, err => {
                if (err.statusCode == 404)
                    return { refs: {} };
                else
                    return Promise.reject(err);
            });
        }
        github.listRefsExtAsync = listRefsExtAsync;
        function resolveRefAsync(r) {
            if (r.object.type == "commit")
                return Promise.resolve(r.object.sha);
            else if (r.object.type == "tag")
                return ghGetJsonAsync(r.object.url)
                    .then((r) => r.object.type == "commit" ? r.object.sha :
                    Promise.reject(new Error("Bad type (2nd order) " + r.object.type)));
            else
                return Promise.reject(new Error("Bad type " + r.object.type));
        }
        function tagToShaAsync(repopath, tag) {
            // TODO  support fetching a tag
            if (/^[a-f0-9]{40}$/.test(tag))
                return Promise.resolve(tag);
            const parsed = parseRepoId(repopath);
            return ghGetJsonAsync(`https://api.github.com/repos/${parsed.slug}/git/refs/tags/${tag}`)
                .then(resolveRefAsync, e => ghGetJsonAsync(`https://api.github.com/repos/${parsed.slug}/git/refs/heads/${tag}`)
                .then(resolveRefAsync));
        }
        function pkgConfigAsync(repopath, tag = "master") {
            return github.db.loadConfigAsync(repopath, tag);
        }
        github.pkgConfigAsync = pkgConfigAsync;
        function downloadPackageAsync(repoWithTag, config) {
            const p = parseRepoId(repoWithTag);
            if (!p) {
                pxt.log('Unknown GitHub syntax');
                return Promise.resolve(undefined);
            }
            if (isRepoBanned(p, config)) {
                pxt.tickEvent("github.download.banned");
                pxt.log('Github repo is banned');
                return Promise.resolve(undefined);
            }
            return github.db.loadPackageAsync(p.fullName, p.tag)
                .then(cached => {
                const dv = upgradedDisablesVariants(config, repoWithTag);
                if (dv) {
                    const cfg = pxt.Package.parseAndValidConfig(cached.files[pxt.CONFIG_NAME]);
                    if (cfg) {
                        pxt.log(`auto-disable ${dv.join(",")} due to targetconfig entry for ${repoWithTag}`);
                        cfg.disablesVariants = dv;
                        cached.files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(cfg);
                    }
                }
                return cached;
            });
        }
        github.downloadPackageAsync = downloadPackageAsync;
        async function downloadLatestPackageAsync(repo) {
            const packageConfig = await pxt.packagesConfigAsync();
            const tag = await pxt.github.latestVersionAsync(repo.slug, packageConfig);
            // download package into cache
            const repoWithTag = `${repo.fullName}#${tag}`;
            await pxt.github.downloadPackageAsync(repoWithTag, packageConfig);
            // return config
            const config = await pkgConfigAsync(repo.fullName, tag);
            const version = `github:${repoWithTag}`;
            return { version, config };
        }
        github.downloadLatestPackageAsync = downloadLatestPackageAsync;
        async function cacheProjectDependenciesAsync(cfg) {
            var _a;
            const ghExtensions = (_a = Object.keys(cfg.dependencies)) === null || _a === void 0 ? void 0 : _a.filter(dep => isGithubId(cfg.dependencies[dep]));
            if (ghExtensions.length) {
                const pkgConfig = await pxt.packagesConfigAsync();
                // Make sure external packages load before installing header.
                await Promise.all(ghExtensions.map(async (ext) => {
                    const extSrc = cfg.dependencies[ext];
                    const ghPkg = await downloadPackageAsync(extSrc, pkgConfig);
                    if (!ghPkg) {
                        throw new Error(lf("Cannot load extension {0} from {1}", ext, extSrc));
                    }
                }));
            }
        }
        github.cacheProjectDependenciesAsync = cacheProjectDependenciesAsync;
        let GitRepoStatus;
        (function (GitRepoStatus) {
            GitRepoStatus[GitRepoStatus["Unknown"] = 0] = "Unknown";
            GitRepoStatus[GitRepoStatus["Approved"] = 1] = "Approved";
            GitRepoStatus[GitRepoStatus["Banned"] = 2] = "Banned";
        })(GitRepoStatus = github.GitRepoStatus || (github.GitRepoStatus = {}));
        function listUserReposAsync() {
            const q = `{
  viewer {
    repositories(first: 100, affiliations: [OWNER, COLLABORATOR], orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        description
        full_name: nameWithOwner
        private: isPrivate
        fork: isFork
        updated_at: updatedAt
        owner {
          login
        }
        defaultBranchRef {
          name
        }
        pxtjson: object(expression: "master:pxt.json") {
          ... on Blob {
            text
          }
        }
        readme: object(expression: "master:README.md") {
          ... on Blob {
            text
          }
        }
      }
    }
  }
}`;
            return ghGraphQLQueryAsync(q)
                .then(res => res.data.viewer.repositories.nodes
                .filter((node) => node.pxtjson) // needs a pxt.json file
                .filter((node) => {
                node.default_branch = node.defaultBranchRef.name;
                const pxtJson = pxt.Package.parseAndValidConfig(node.pxtjson && node.pxtjson.text);
                const readme = node.readme && node.readme.text;
                // needs to have a valid pxt.json file
                if (!pxtJson)
                    return false;
                // new style of supported annontation
                if (pxtJson.supportedTargets)
                    return pxtJson.supportedTargets.indexOf(pxt.appTarget.id) > -1;
                // legacy readme.md annotations
                return readme && readme.indexOf("PXT/" + pxt.appTarget.id) > -1;
            })
                .map((node) => mkRepo(node, { fullName: node.full_name })));
        }
        github.listUserReposAsync = listUserReposAsync;
        function createRepoAsync(name, description, priv) {
            return ghPostAsync("https://api.github.com/user/repos", {
                name,
                description,
                private: !!priv,
                has_issues: true,
                has_projects: false,
                has_wiki: false,
                allow_rebase_merge: false,
                allow_merge_commit: true,
                delete_branch_on_merge: false // keep branches for naming purposes
            }).then(v => mkRepo(v));
        }
        github.createRepoAsync = createRepoAsync;
        async function enablePagesAsync(repo) {
            // https://developer.github.com/v3/repos/pages/#enable-a-pages-site
            // try read status
            const parsed = parseRepoId(repo);
            let url = undefined;
            try {
                const status = await ghGetJsonAsync(`https://api.github.com/repos/${parsed.slug}/pages`); // try to get the pages
                if (status)
                    url = status.html_url;
            }
            catch (e) { }
            // status failed, try enabling pages
            if (!url) {
                // enable pages
                try {
                    const r = await ghPostAsync(`https://api.github.com/repos/${parsed.slug}/pages`, {
                        source: {
                            branch: "master",
                            path: "/"
                        }
                    }, {
                        "Accept": "application/vnd.github.switcheroo-preview+json"
                    });
                    url = r.html_url;
                }
                catch (e) { // this is still an experimental api subject to changes
                    pxt.tickEvent("github.pages.error");
                    pxt.reportException(e);
                }
            }
            // we have a URL, update project
            if (url) {
                // check if the repo already has a web site
                const rep = await ghGetJsonAsync(`https://api.github.com/repos/${repo}`);
                if (rep && !rep.homepage) {
                    try {
                        await ghPostAsync(`https://api.github.com/repos/${repo}`, { "homepage": url }, undefined, "PATCH");
                    }
                    catch (e) {
                        // just ignore if fail to update the homepage
                        pxt.tickEvent("github.homepage.error");
                    }
                }
            }
        }
        github.enablePagesAsync = enablePagesAsync;
        function repoIconUrl(repo) {
            if (repo.status != GitRepoStatus.Approved)
                return undefined;
            return mkRepoIconUrl(repo);
        }
        github.repoIconUrl = repoIconUrl;
        function mkRepoIconUrl(repo) {
            return pxt.Cloud.cdnApiUrl(`gh/${repo.fullName}/icon`);
        }
        github.mkRepoIconUrl = mkRepoIconUrl;
        function mkRepo(r, options) {
            var _a;
            if (!r)
                return undefined;
            const rr = {
                owner: r.owner.login.toLowerCase(),
                slug: r.full_name.toLowerCase(),
                fullName: ((options === null || options === void 0 ? void 0 : options.fullName) || r.full_name).toLowerCase(),
                fileName: (_a = options === null || options === void 0 ? void 0 : options.fileName) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase(),
                name: r.name,
                description: r.description,
                defaultBranch: r.default_branch,
                tag: options === null || options === void 0 ? void 0 : options.tag,
                updatedAt: Math.round(new Date(r.updated_at).getTime() / 1000),
                fork: r.fork,
                private: r.private,
            };
            rr.status = repoStatus(rr, options === null || options === void 0 ? void 0 : options.config);
            return rr;
        }
        function repoStatus(rr, config) {
            if (!rr)
                return GitRepoStatus.Unknown;
            return isRepoBanned(rr, config) ? GitRepoStatus.Banned
                : isRepoApproved(rr, config) ? GitRepoStatus.Approved
                    : GitRepoStatus.Unknown;
        }
        github.repoStatus = repoStatus;
        function isOrgBanned(repo, config) {
            if (!config)
                return false; // don't know
            if (!repo || !repo.owner)
                return true;
            if (config.bannedOrgs
                && config.bannedOrgs.some(org => org.toLowerCase() == repo.owner.toLowerCase()))
                return true;
            return false;
        }
        function isRepoBanned(repo, config) {
            if (isOrgBanned(repo, config))
                return true;
            if (!config)
                return false; // don't know
            if (!repo || !repo.fullName)
                return true;
            if (config.bannedRepos
                && config.bannedRepos.some(fn => fn.toLowerCase() == repo.fullName.toLowerCase()))
                return true;
            return false;
        }
        function isOrgApproved(repo, config) {
            if (!repo || !config)
                return false;
            if (repo.owner
                && config.approvedOrgs
                && config.approvedOrgs.some(org => org.toLowerCase() == repo.owner.toLowerCase()))
                return true;
            return false;
        }
        function isRepoApproved(repo, config) {
            if (isOrgApproved(repo, config))
                return true;
            if (!repo || !config)
                return false;
            if (repo.fullName
                && config.approvedRepos
                && config.approvedRepos.some(fn => fn.toLowerCase() == repo.fullName.toLowerCase()))
                return true;
            return false;
        }
        async function repoAsync(repopath, config) {
            const rid = parseRepoId(repopath);
            if (!rid)
                return undefined;
            const status = repoStatus(rid, config);
            if (status == GitRepoStatus.Banned)
                return undefined;
            // always try proxy first
            if (hasProxy()) {
                try {
                    return await proxyRepoAsync(rid, status);
                }
                catch (e) {
                    ghProxyHandleException(e);
                }
            }
            // try github apis
            const r = await ghGetJsonAsync("https://api.github.com/repos/" + rid.slug);
            return mkRepo(r, { config, fullName: rid.fullName, fileName: rid.fileName, tag: rid.tag });
        }
        github.repoAsync = repoAsync;
        function proxyRepoAsync(rid, status) {
            // always use proxy
            return ghProxyWithCdnJsonAsync(rid.slug)
                .then(meta => {
                if (!meta)
                    return undefined;
                return {
                    github: true,
                    owner: rid.owner,
                    fullName: rid.fullName,
                    fileName: rid.fileName,
                    slug: rid.slug,
                    name: rid.fileName ? `${meta.name}-${rid.fileName}` : meta.name,
                    description: meta.description,
                    defaultBranch: meta.defaultBranch || "master",
                    tag: rid.tag,
                    status
                };
            }).catch(err => {
                pxt.reportException(err);
                return undefined;
            });
        }
        function searchAsync(query, config) {
            if (!config)
                return Promise.resolve([]);
            let repos = query.split('|').map(parseRepoId).filter(repo => !!repo);
            if (repos.length > 0)
                return Promise.all(repos.map(id => repoAsync(id.fullName, config)))
                    .then(rs => rs.filter(r => r && r.status != GitRepoStatus.Banned)); // allow deep links to github repos
            // todo fix search
            const fetch = () => pxt.U.httpGetJsonAsync(`${pxt.Cloud.apiRoot}ghsearch/${pxt.appTarget.id}/${pxt.appTarget.platformid || pxt.appTarget.id}?q=${encodeURIComponent(query)}`);
            return fetch()
                .then((rs) => rs.items.map(item => mkRepo(item, { config, fullName: item.full_name }))
                .filter(r => r.status == GitRepoStatus.Approved || (config.allowUnapproved && r.status == GitRepoStatus.Unknown))
                // don't return the target itself!
                .filter(r => !pxt.appTarget.appTheme.githubUrl || `https://github.com/${r.fullName}` != pxt.appTarget.appTheme.githubUrl.toLowerCase()))
                .catch(err => []); // offline
        }
        github.searchAsync = searchAsync;
        // parse https://github.com/[company]/[project](/filepath)(#tag)
        function parseRepoId(repo) {
            if (!repo)
                return undefined;
            // clean out whitespaces
            repo = repo.trim();
            // trim trailing /
            repo = repo.replace(/\/$/, '');
            // convert github pages into github repo
            const mgh = /^https:\/\/([^./#]+)\.github\.io\/([^/#]+)\/?$/i.exec(repo);
            if (mgh)
                repo = `github:${mgh[1]}/${mgh[2]}`;
            repo = repo.replace(/^github:/i, "");
            repo = repo.replace(/^https:\/\/github\.com\//i, "");
            repo = repo.replace(/\.git\b/i, "");
            const m = /^([^#\/:]+)\/([^#\/:]+)(\/([^#]+))?(#([^\/:]*))?$/.exec(repo);
            if (!m)
                return undefined;
            const owner = m[1];
            const project = m[2];
            let fileName = m[4];
            const tag = m[6];
            const treeM = fileName && /^tree\/([^\/]+\/)/.exec(fileName);
            if (treeM) {
                // https://github.com/pelikhan/mono-demo/tree/master/demo2
                fileName = fileName.slice(treeM[0].length);
                // branch info?
            }
            return {
                owner,
                project,
                slug: join(owner, project),
                fullName: join(owner, project, fileName),
                tag,
                fileName
            };
        }
        github.parseRepoId = parseRepoId;
        function toGithubDependencyPath(path, tag) {
            let r = "github:" + path;
            if (tag)
                r += "#" + tag;
            return r;
        }
        github.toGithubDependencyPath = toGithubDependencyPath;
        function isGithubId(id) {
            if (!id)
                return false;
            return id.slice(0, 7) == "github:";
        }
        github.isGithubId = isGithubId;
        function stringifyRepo(p) {
            return p ? "github:" + p.fullName.toLowerCase() + "#" + (p.tag || "master") : undefined;
        }
        github.stringifyRepo = stringifyRepo;
        function normalizeRepoId(id) {
            const gid = parseRepoId(id);
            if (!gid)
                return undefined;
            gid.tag = gid.tag || "master";
            return stringifyRepo(gid);
        }
        github.normalizeRepoId = normalizeRepoId;
        function join(...parts) {
            return parts.filter(p => !!p).join('/');
        }
        github.join = join;
        function upgradeRule(cfg, id) {
            if (!cfg || !cfg.upgrades)
                return null;
            const parsed = parseRepoId(id);
            if (!parsed)
                return null;
            return pxt.U.lookup(cfg.upgrades, parsed.fullName.toLowerCase());
        }
        function upgradedDisablesVariants(cfg, id) {
            const upgr = upgradeRule(cfg, id);
            const m = /^dv:(.*)/.exec(upgr);
            if (m) {
                const disabled = m[1].split(/,/);
                if (disabled.some(d => !/^\w+$/.test(d)))
                    return null;
                return disabled;
            }
            return null;
        }
        function upgradedPackageReference(cfg, id) {
            const upgr = upgradeRule(cfg, id);
            if (!upgr)
                return null;
            const m = /^min:(.*)/.exec(upgr);
            const minV = m && pxt.semver.tryParse(m[1]);
            if (minV) {
                const parsed = parseRepoId(id);
                const currV = pxt.semver.tryParse(parsed.tag);
                if (currV && pxt.semver.cmp(currV, minV) < 0) {
                    parsed.tag = m[1];
                    pxt.debug(`upgrading ${id} to ${m[1]}`);
                    return stringifyRepo(parsed);
                }
                else {
                    if (!currV)
                        pxt.log(`not upgrading ${id} - cannot parse version`);
                    return null;
                }
            }
            else {
                // check if the rule looks valid at all
                if (!upgradedDisablesVariants(cfg, id))
                    pxt.log(`invalid upgrade rule: ${id} -> ${upgr}`);
            }
            return id;
        }
        github.upgradedPackageReference = upgradedPackageReference;
        function upgradedPackageId(cfg, id) {
            const dv = upgradedDisablesVariants(cfg, id);
            if (dv)
                return id + "?dv=" + dv.join(",");
            return id;
        }
        github.upgradedPackageId = upgradedPackageId;
        function latestVersionAsync(repopath, config, useProxy, noCache) {
            const parsed = parseRepoId(repopath);
            if (!parsed)
                return Promise.resolve(null);
            return repoAsync(parsed.slug, config)
                .then(scr => {
                if (!scr)
                    return undefined;
                return listRefsExtAsync(scr.slug, "tags", useProxy, noCache)
                    .then(refsRes => {
                    let tags = Object.keys(refsRes.refs);
                    // only look for semver tags
                    tags = pxt.semver.sortLatestTags(tags);
                    // check if the version has been frozen for this release
                    const targetVersion = pxt.appTarget.versions && pxt.semver.tryParse(pxt.appTarget.versions.target);
                    if (targetVersion && config.releases && config.releases["v" + targetVersion.major]) {
                        const release = config.releases["v" + targetVersion.major]
                            .map(repo => pxt.github.parseRepoId(repo))
                            .filter(repo => repo && repo.fullName.toLowerCase() == parsed.fullName.toLowerCase())[0];
                        if (release) {
                            // this repo is frozen to a particular tag for this target
                            if (tags.some(t => t == release.tag)) { // tag still exists!!!
                                pxt.debug(`approved release ${release.fullName}#${release.tag} for v${targetVersion.major}`);
                                return Promise.resolve(release.tag);
                            }
                            else {
                                // so the package was snapped to a particular tag but the tag does not exist anymore
                                pxt.reportError(`packages`, `approved release ${release.fullName}#${release.tag} for v${targetVersion.major} not found anymore`, { repo: scr.fullName });
                                // in this case, we keep going, we might be lucky and the current version of the package might still load
                            }
                        }
                    }
                    if (tags[0])
                        return Promise.resolve(tags[0]);
                    else
                        return refsRes.head || tagToShaAsync(scr.slug, scr.defaultBranch);
                });
            });
        }
        github.latestVersionAsync = latestVersionAsync;
        function resolveMonoRepoVersions(deps) {
            deps = pxt.Util.clone(deps);
            // before loading dependencies, ensure that all mono-repo are in sync
            const slugVersions = {};
            // group and collect versions
            Object.keys(deps)
                .map(id => ({ id, ghid: github.parseRepoId(deps[id]) }))
                .filter(v => { var _a; return (_a = v.ghid) === null || _a === void 0 ? void 0 : _a.tag; })
                .forEach(v => {
                const { id, ghid } = v;
                // check version
                let version = slugVersions[ghid.slug];
                if (!version) {
                    version = slugVersions[ghid.slug] = {
                        tag: ghid.tag,
                        deps: []
                    };
                }
                version.deps.push(v);
                if (pxt.semver.strcmp(version.tag, ghid.tag) < 0) {
                    pxt.debug(`dep: resolve later monorepo tag to ${pxt.github.stringifyRepo(ghid)}`);
                    version.tag = ghid.tag;
                }
            });
            // patch depdencies
            pxt.U.values(slugVersions)
                .forEach(v => v.deps
                .forEach(dep => {
                if (dep.ghid.tag !== v.tag) {
                    pxt.debug(`dep: ${pxt.github.stringifyRepo(dep.ghid)} -> ${v.tag}`);
                    dep.ghid.tag = v.tag;
                    deps[dep.id] = pxt.github.stringifyRepo(dep.ghid);
                }
            }));
            return deps;
        }
        github.resolveMonoRepoVersions = resolveMonoRepoVersions;
        github.GIT_JSON = ".git.json";
        const GRAPHQL_URL = "https://api.github.com/graphql";
        function lookupFile(parsed, commit, path) {
            if (!commit)
                return null;
            const fpath = join(parsed.fileName, path);
            return commit.tree.tree.find(e => e.path == fpath);
        }
        github.lookupFile = lookupFile;
        /**
         * Executes a GraphQL query against GitHub v4 api
         * @param query
         */
        function ghGraphQLQueryAsync(query) {
            const payload = JSON.stringify({
                query
            });
            return ghPostAsync(GRAPHQL_URL, payload);
        }
        github.ghGraphQLQueryAsync = ghGraphQLQueryAsync;
        /**
         * Finds the first PR associated with a branch
         * @param reponame
         * @param headName
         */
        function findPRNumberforBranchAsync(reponame, headName) {
            const repoId = parseRepoId(reponame);
            const query = `
{
    repository(owner: ${JSON.stringify(repoId.owner)}, name: ${JSON.stringify(repoId.project)}) {
        pullRequests(last: 1, states: [OPEN, MERGED], headRefName: ${JSON.stringify(headName)}) {
            edges {
                node {
                    number
                    state
                    mergeable
                    baseRefName
                    url
                    isDraft
                }
            }
        }
    }
}
`;
            /*
            {
              "data": {
                "repository": {
                  "pullRequests": {
                    "edges": [
                      {
                        "node": {
                          "title": "use close icon instead of cancel",
                          "number": 6324
                        }
                      }
                    ]
                  }
                }
              }
            }*/
            return ghGraphQLQueryAsync(query)
                .then(resp => {
                const edge = resp.data.repository.pullRequests.edges[0];
                if (edge && edge.node) {
                    const node = edge.node;
                    return {
                        number: node.number,
                        mergeable: node.mergeable,
                        state: node.state,
                        title: node.title,
                        url: node.url,
                        base: node.baseRefName
                    };
                }
                return {
                    number: -1
                };
            });
        }
        github.findPRNumberforBranchAsync = findPRNumberforBranchAsync;
        function getPagesStatusAsync(repoPath) {
            return ghGetJsonAsync(`https://api.github.com/repos/${repoPath}/pages`)
                .catch(e => ({
                status: null
            }));
        }
        github.getPagesStatusAsync = getPagesStatusAsync;
    })(github = pxt.github || (pxt.github = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    // keep all of these in sync with pxtbase.h
    pxt.REFCNT_FLASH = "0xfffe";
    pxt.VTABLE_MAGIC = 0xF9;
    pxt.ValTypeObject = 4;
    let BuiltInType;
    (function (BuiltInType) {
        BuiltInType[BuiltInType["BoxedString"] = 1] = "BoxedString";
        BuiltInType[BuiltInType["BoxedNumber"] = 2] = "BoxedNumber";
        BuiltInType[BuiltInType["BoxedBuffer"] = 3] = "BoxedBuffer";
        BuiltInType[BuiltInType["RefAction"] = 4] = "RefAction";
        BuiltInType[BuiltInType["RefImage"] = 5] = "RefImage";
        BuiltInType[BuiltInType["RefCollection"] = 6] = "RefCollection";
        BuiltInType[BuiltInType["RefRefLocal"] = 7] = "RefRefLocal";
        BuiltInType[BuiltInType["RefMap"] = 8] = "RefMap";
        BuiltInType[BuiltInType["RefMImage"] = 9] = "RefMImage";
        BuiltInType[BuiltInType["MMap"] = 10] = "MMap";
        BuiltInType[BuiltInType["BoxedString_SkipList"] = 11] = "BoxedString_SkipList";
        BuiltInType[BuiltInType["BoxedString_ASCII"] = 12] = "BoxedString_ASCII";
        BuiltInType[BuiltInType["User0"] = 16] = "User0";
    })(BuiltInType = pxt.BuiltInType || (pxt.BuiltInType = {}));
})(pxt || (pxt = {}));
(function (pxt) {
    var HF2;
    (function (HF2) {
        // see https://github.com/microsoft/uf2/blob/master/hf2.md for full spec
        HF2.HF2_CMD_BININFO = 0x0001; // no arguments
        HF2.HF2_MODE_BOOTLOADER = 0x01;
        HF2.HF2_MODE_USERSPACE = 0x02;
        /*
        struct HF2_BININFO_Result {
            uint32_t mode;
            uint32_t flash_page_size;
            uint32_t flash_num_pages;
            uint32_t max_message_size;
        };
        */
        HF2.HF2_CMD_INFO = 0x0002;
        // no arguments
        // results is utf8 character array
        HF2.HF2_CMD_RESET_INTO_APP = 0x0003; // no arguments, no result
        HF2.HF2_CMD_RESET_INTO_BOOTLOADER = 0x0004; // no arguments, no result
        HF2.HF2_CMD_START_FLASH = 0x0005; // no arguments, no result
        HF2.HF2_CMD_WRITE_FLASH_PAGE = 0x0006;
        /*
        struct HF2_WRITE_FLASH_PAGE_Command {
            uint32_t target_addr;
            uint32_t data[flash_page_size];
        };
        */
        // no result
        HF2.HF2_CMD_CHKSUM_PAGES = 0x0007;
        /*
        struct HF2_CHKSUM_PAGES_Command {
            uint32_t target_addr;
            uint32_t num_pages;
        };
        struct HF2_CHKSUM_PAGES_Result {
            uint16_t chksums[num_pages];
        };
        */
        HF2.HF2_CMD_READ_WORDS = 0x0008;
        /*
        struct HF2_READ_WORDS_Command {
            uint32_t target_addr;
            uint32_t num_words;
        };
        struct HF2_READ_WORDS_Result {
            uint32_t words[num_words];
        };
        */
        HF2.HF2_CMD_WRITE_WORDS = 0x0009;
        /*
        struct HF2_WRITE_WORDS_Command {
            uint32_t target_addr;
            uint32_t num_words;
            uint32_t words[num_words];
        };
        */
        // no result
        HF2.HF2_CMD_DMESG = 0x0010;
        // no arguments
        // results is utf8 character array
        HF2.HF2_FLAG_SERIAL_OUT = 0x80;
        HF2.HF2_FLAG_SERIAL_ERR = 0xC0;
        HF2.HF2_FLAG_CMDPKT_LAST = 0x40;
        HF2.HF2_FLAG_CMDPKT_BODY = 0x00;
        HF2.HF2_FLAG_MASK = 0xC0;
        HF2.HF2_SIZE_MASK = 63;
        HF2.HF2_STATUS_OK = 0x00;
        HF2.HF2_STATUS_INVALID_CMD = 0x01;
        HF2.HF2_STATUS_EXEC_ERR = 0x02;
        HF2.HF2_STATUS_EVENT = 0x80;
        HF2.HF2_CMD_JDS_CONFIG = 0x0020;
        HF2.HF2_CMD_JDS_SEND = 0x0021;
        HF2.HF2_EV_JDS_PACKET = 0x800020;
        HF2.CUSTOM_EV_JACDAC = "jacdac";
        // the eventId is overlayed on the tag+status; the mask corresponds
        // to the HF2_STATUS_EVENT above
        HF2.HF2_EV_MASK = 0x800000;
        function write32(buf, pos, v) {
            buf[pos + 0] = (v >> 0) & 0xff;
            buf[pos + 1] = (v >> 8) & 0xff;
            buf[pos + 2] = (v >> 16) & 0xff;
            buf[pos + 3] = (v >> 24) & 0xff;
        }
        HF2.write32 = write32;
        function write16(buf, pos, v) {
            buf[pos + 0] = (v >> 0) & 0xff;
            buf[pos + 1] = (v >> 8) & 0xff;
        }
        HF2.write16 = write16;
        function read32(buf, pos) {
            return (buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16) | (buf[pos + 3] << 24)) >>> 0;
        }
        HF2.read32 = read32;
        function read16(buf, pos) {
            return buf[pos] | (buf[pos + 1] << 8);
        }
        HF2.read16 = read16;
        function encodeU32LE(words) {
            let r = new Uint8Array(words.length * 4);
            for (let i = 0; i < words.length; ++i)
                write32(r, i * 4, words[i]);
            return r;
        }
        HF2.encodeU32LE = encodeU32LE;
        function decodeU32LE(buf) {
            let res = [];
            for (let i = 0; i < buf.length; i += 4)
                res.push(read32(buf, i));
            return res;
        }
        HF2.decodeU32LE = decodeU32LE;
        let logEnabled = false;
        function enableLog() {
            logEnabled = true;
        }
        HF2.enableLog = enableLog;
        function log(msg) {
            if (logEnabled)
                pxt.log("HF2: " + msg);
            else
                pxt.debug("HF2: " + msg);
        }
        class Wrapper {
            constructor(io) {
                var _a;
                this.io = io;
                this.cmdSeq = pxt.U.randomUint32();
                this.lock = new pxt.U.PromiseQueue();
                this.flashing = false;
                this.rawMode = false;
                this.maxMsgSize = 63; // when running in forwarding mode, we do not really know
                this.bootloaderMode = false;
                this.reconnectTries = 0;
                this.autoReconnect = false;
                this.icon = ((_a = pxt.appTarget.appTheme.downloadDialogTheme) === null || _a === void 0 ? void 0 : _a.deviceIcon) || "usb";
                this.msgs = new pxt.U.PromiseBuffer();
                this.eventHandlers = {};
                this.jacdacAvailable = false;
                this.onSerial = (buf, isStderr) => { };
                this.onCustomEvent = (type, payload) => { };
                let frames = [];
                io.onDeviceConnectionChanged = connect => this.disconnectAsync()
                    .then(() => connect && this.reconnectAsync());
                io.onSerial = (b, e) => this.onSerial(b, e);
                io.onData = buf => {
                    let tp = buf[0] & HF2.HF2_FLAG_MASK;
                    let len = buf[0] & 63;
                    //console.log(`msg tp=${tp} len=${len}`)
                    let frame = new Uint8Array(len);
                    pxt.U.memcpy(frame, 0, buf, 1, len);
                    if (tp & HF2.HF2_FLAG_SERIAL_OUT) {
                        this.onSerial(frame, tp == HF2.HF2_FLAG_SERIAL_ERR);
                        return;
                    }
                    frames.push(frame);
                    if (tp == HF2.HF2_FLAG_CMDPKT_BODY) {
                        return;
                    }
                    else {
                        pxt.U.assert(tp == HF2.HF2_FLAG_CMDPKT_LAST);
                        let total = 0;
                        for (let f of frames)
                            total += f.length;
                        let r = new Uint8Array(total);
                        let ptr = 0;
                        for (let f of frames) {
                            pxt.U.memcpy(r, ptr, f);
                            ptr += f.length;
                        }
                        frames = [];
                        if (r[2] & HF2.HF2_STATUS_EVENT) {
                            // asynchronous event
                            io.onEvent(r);
                        }
                        else {
                            this.msgs.push(r);
                        }
                    }
                };
                io.onEvent = buf => {
                    let evid = read32(buf, 0);
                    let f = pxt.U.lookup(this.eventHandlers, evid + "");
                    if (f) {
                        f(buf.slice(4));
                    }
                    else {
                        log("unhandled event: " + evid.toString(16));
                    }
                };
                io.onError = err => {
                    log("recv error: " + err.message);
                    if (this.autoReconnect) {
                        this.autoReconnect = false;
                        this.reconnectAsync()
                            .then(() => {
                            this.autoReconnect = true;
                        }, err => {
                            log("reconnect error: " + err.message);
                        });
                    }
                    //this.msgs.pushError(err)
                };
                this.onEvent(HF2.HF2_EV_JDS_PACKET, buf => {
                    this.onCustomEvent(HF2.CUSTOM_EV_JACDAC, buf);
                });
            }
            resetState() {
                this.lock = new pxt.U.PromiseQueue();
                this.info = null;
                this.infoRaw = null;
                this.pageSize = null;
                this.flashSize = null;
                this.maxMsgSize = 63;
                this.bootloaderMode = false;
                this.msgs.drain();
            }
            onEvent(id, f) {
                pxt.U.assert(!!(id & HF2.HF2_EV_MASK));
                this.eventHandlers[id + ""] = f;
            }
            sendCustomEventAsync(type, payload) {
                if (type == HF2.CUSTOM_EV_JACDAC)
                    if (this.jacdacAvailable)
                        return this.talkAsync(HF2.HF2_CMD_JDS_SEND, payload)
                            .then(() => { });
                    else
                        return Promise.resolve(); // ignore
                return Promise.reject(new Error("invalid custom event type"));
            }
            reconnectAsync() {
                this.resetState();
                log(`reconnect raw=${this.rawMode}`);
                return this.io.reconnectAsync()
                    .then(() => this.initAsync())
                    .catch(e => {
                    if (this.reconnectTries < 5) {
                        this.reconnectTries++;
                        log(`error ${e.message}; reconnecting attempt #${this.reconnectTries}`);
                        return pxt.U.delay(500)
                            .then(() => this.reconnectAsync());
                    }
                    else {
                        throw e;
                    }
                });
            }
            disconnectAsync() {
                log(`disconnect`);
                return this.io.disconnectAsync();
            }
            error(m) {
                return this.io.error(m);
            }
            talkAsync(cmd, data) {
                if (this.io.talksAsync)
                    return this.io.talksAsync([{ cmd, data }])
                        .then(v => v[0]);
                let len = 8;
                if (data)
                    len += data.length;
                let pkt = new Uint8Array(len);
                let seq = ++this.cmdSeq & 0xffff;
                write32(pkt, 0, cmd);
                write16(pkt, 4, seq);
                write16(pkt, 6, 0);
                if (data)
                    pxt.U.memcpy(pkt, 8, data, 0, data.length);
                let numSkipped = 0;
                let handleReturnAsync = () => this.msgs.shiftAsync(1000) // we wait up to a second
                    .then(res => {
                    if (read16(res, 0) != seq) {
                        if (numSkipped < 3) {
                            numSkipped++;
                            log(`message out of sync, (${seq} vs ${read16(res, 0)}); will re-try`);
                            return handleReturnAsync();
                        }
                        this.error("out of sync");
                    }
                    let info = "";
                    if (res[3])
                        info = "; info=" + res[3];
                    switch (res[2]) {
                        case HF2.HF2_STATUS_OK:
                            return res.slice(4);
                        case HF2.HF2_STATUS_INVALID_CMD:
                            this.error("invalid command" + info);
                            break;
                        case HF2.HF2_STATUS_EXEC_ERR:
                            this.error("execution error" + info);
                            break;
                        default:
                            this.error("error " + res[2] + info);
                            break;
                    }
                    return null;
                });
                return this.sendMsgAsync(pkt)
                    .then(handleReturnAsync);
            }
            sendMsgAsync(buf) {
                return this.sendMsgCoreAsync(buf);
            }
            sendSerialAsync(buf, useStdErr = false) {
                if (this.io.sendSerialAsync)
                    return this.io.sendSerialAsync(buf, useStdErr);
                return this.sendMsgCoreAsync(buf, useStdErr ? 2 : 1);
            }
            sendMsgCoreAsync(buf, serial = 0) {
                // Util.assert(buf.length <= this.maxMsgSize)
                let frame = new Uint8Array(64);
                let loop = (pos) => {
                    let len = buf.length - pos;
                    if (len <= 0)
                        return Promise.resolve();
                    if (len > 63) {
                        len = 63;
                        frame[0] = HF2.HF2_FLAG_CMDPKT_BODY;
                    }
                    else {
                        frame[0] = HF2.HF2_FLAG_CMDPKT_LAST;
                    }
                    if (serial)
                        frame[0] = serial == 1 ? HF2.HF2_FLAG_SERIAL_OUT : HF2.HF2_FLAG_SERIAL_ERR;
                    frame[0] |= len;
                    for (let i = 0; i < len; ++i)
                        frame[i + 1] = buf[pos + i];
                    return this.io.sendPacketAsync(frame)
                        .then(() => loop(pos + len));
                };
                return this.lock.enqueue("out", () => loop(0));
            }
            switchToBootloaderAsync() {
                if (this.bootloaderMode)
                    return Promise.resolve();
                log(`Switching into bootloader mode`);
                if (this.io.isSwitchingToBootloader) {
                    this.io.isSwitchingToBootloader();
                }
                return this.maybeReconnectAsync()
                    .then(() => this.talkAsync(HF2.HF2_CMD_START_FLASH)
                    .then(() => { }, err => this.talkAsync(HF2.HF2_CMD_RESET_INTO_BOOTLOADER)
                    .then(() => { }, err => { })
                    .then(() => this.reconnectAsync()
                    .catch(err => {
                    if (err.type === "devicenotfound")
                        err.type = "repairbootloader";
                    throw err;
                }))))
                    .then(() => this.initAsync())
                    .then(() => {
                    if (!this.bootloaderMode)
                        this.error("cannot switch into bootloader mode");
                });
            }
            isFlashing() {
                return !!this.flashing;
            }
            reflashAsync(resp) {
                log(`reflash`);
                pxt.U.assert(pxt.appTarget.compile.useUF2);
                const f = resp.outfiles[pxtc.BINARY_UF2];
                const blocks = pxtc.UF2.parseFile(pxt.Util.stringToUint8Array(atob(f)));
                this.flashing = true;
                return this.io.reconnectAsync()
                    .then(() => this.flashAsync(blocks))
                    .then(() => pxt.U.delay(100))
                    .finally(() => this.flashing = false)
                    .then(() => this.reconnectAsync());
            }
            writeWordsAsync(addr, words) {
                pxt.U.assert(words.length <= 64); // just sanity check
                return this.talkAsync(HF2.HF2_CMD_WRITE_WORDS, encodeU32LE([addr, words.length].concat(words)))
                    .then(() => { });
            }
            readWordsAsync(addr, numwords) {
                let args = new Uint8Array(8);
                write32(args, 0, addr);
                write32(args, 4, numwords);
                pxt.U.assert(numwords <= 64); // just sanity check
                return this.talkAsync(HF2.HF2_CMD_READ_WORDS, args);
            }
            pingAsync() {
                if (this.rawMode)
                    return Promise.resolve();
                return this.talkAsync(HF2.HF2_CMD_BININFO)
                    .then(buf => { });
            }
            maybeReconnectAsync() {
                return this.pingAsync()
                    .catch(e => this.reconnectAsync()
                    .then(() => this.pingAsync()));
            }
            flashAsync(blocks) {
                let start = Date.now();
                let fstart = 0;
                let loopAsync = (pos) => {
                    if (pos >= blocks.length)
                        return Promise.resolve();
                    let b = blocks[pos];
                    //U.assert(b.payloadSize == this.pageSize)
                    let buf = new Uint8Array(4 + b.payloadSize);
                    write32(buf, 0, b.targetAddr);
                    pxt.U.memcpy(buf, 4, b.data, 0, b.payloadSize);
                    return this.talkAsync(HF2.HF2_CMD_WRITE_FLASH_PAGE, buf)
                        .then(() => loopAsync(pos + 1));
                };
                return this.switchToBootloaderAsync()
                    .then(() => {
                    let size = blocks.length * 256;
                    log(`Starting flash (${Math.round(size / 1024)}kB).`);
                    fstart = Date.now();
                    // only try partial flash when page size is small
                    if (this.pageSize > 16 * 1024)
                        return blocks;
                    return onlyChangedBlocksAsync(blocks, (a, l) => this.readWordsAsync(a, l));
                })
                    .then(res => {
                    if (res.length != blocks.length) {
                        blocks = res;
                        let size = blocks.length * 256;
                        log(`Performing partial flash (${Math.round(size / 1024)}kB).`);
                    }
                })
                    .then(() => loopAsync(0))
                    .then(() => {
                    let n = Date.now();
                    let t0 = n - start;
                    let t1 = n - fstart;
                    log(`Flashing done at ${Math.round(blocks.length * 256 / t1 * 1000 / 1024)} kB/s in ${t0}ms (reset ${t0 - t1}ms). Resetting.`);
                })
                    .then(() => this.talkAsync(HF2.HF2_CMD_RESET_INTO_APP)
                    .catch(e => {
                    // error expected here - device is resetting
                }))
                    .then(() => { });
            }
            initAsync() {
                if (this.rawMode)
                    return Promise.resolve();
                return Promise.resolve()
                    .then(() => this.talkAsync(HF2.HF2_CMD_BININFO))
                    .then(binfo => {
                    this.bootloaderMode = binfo[0] == HF2.HF2_MODE_BOOTLOADER;
                    this.pageSize = read32(binfo, 4);
                    this.flashSize = read32(binfo, 8) * this.pageSize;
                    this.maxMsgSize = read32(binfo, 12);
                    this.familyID = read32(binfo, 16);
                    log(`Connected; msgSize ${this.maxMsgSize}B; flash ${this.flashSize / 1024}kB; ${this.bootloaderMode ? "bootloader" : "application"} mode; family=0x${this.familyID.toString(16)}`);
                    return this.talkAsync(HF2.HF2_CMD_INFO);
                })
                    .then(buf => {
                    this.infoRaw = pxt.U.fromUTF8(pxt.U.uint8ArrayToString(buf));
                    pxt.debug("Info: " + this.infoRaw);
                    let info = {};
                    ("Header: " + this.infoRaw).replace(/^([\w\-]+):\s*([^\n\r]*)/mg, (f, n, v) => {
                        info[n.replace(/-/g, "")] = v;
                        return "";
                    });
                    this.info = info;
                    let m = /v(\d\S+)(\s+(\S+))?/.exec(this.info.Header);
                    if (m)
                        this.info.Parsed = {
                            Version: m[1],
                            Features: m[3] || "",
                        };
                    else
                        this.info.Parsed = {
                            Version: "?",
                            Features: "",
                        };
                    log(`Board-ID: ${this.info.BoardID} v${this.info.Parsed.Version} f${this.info.Parsed.Features}`);
                })
                    .then(() => this.talkAsync(HF2.HF2_CMD_JDS_CONFIG, new Uint8Array([1])).then(() => {
                    this.jacdacAvailable = true;
                }, _err => {
                    this.jacdacAvailable = false;
                }))
                    .then(() => {
                    this.reconnectTries = 0;
                });
            }
        }
        HF2.Wrapper = Wrapper;
        function mkHF2PacketIOWrapper(io) {
            pxt.debug(`packetio: wrapper hf2`);
            return new Wrapper(io);
        }
        HF2.mkHF2PacketIOWrapper = mkHF2PacketIOWrapper;
        function readChecksumBlockAsync(readWordsAsync) {
            if (!pxt.appTarget.compile.flashChecksumAddr)
                return Promise.resolve(null);
            return readWordsAsync(pxt.appTarget.compile.flashChecksumAddr, 12)
                .then(buf => {
                let blk = pxtc.parseChecksumBlock(buf);
                if (!blk)
                    return null;
                return readWordsAsync(blk.endMarkerPos, 1)
                    .then(w => {
                    if (read32(w, 0) != blk.endMarker) {
                        pxt.log("end-marker mismatch");
                        return null;
                    }
                    return blk;
                });
            });
        }
        function onlyChangedBlocksAsync(blocks, readWordsAsync) {
            if (!pxt.appTarget.compile.flashChecksumAddr)
                return Promise.resolve(blocks);
            let blBuf = pxtc.UF2.readBytes(blocks, pxt.appTarget.compile.flashChecksumAddr, 12 * 4);
            let blChk = pxtc.parseChecksumBlock(blBuf);
            if (!blChk)
                return Promise.resolve(blocks);
            return readChecksumBlockAsync(readWordsAsync)
                .then(devChk => {
                if (!devChk)
                    return blocks;
                let regionsOk = devChk.regions.filter(r => {
                    let hasMatching = blChk.regions.some(r2 => r.checksum == r2.checksum &&
                        r.length == r2.length &&
                        r.start == r2.start);
                    return hasMatching;
                });
                if (regionsOk.length == 0)
                    return blocks;
                log("skipping flash at: " +
                    regionsOk.map(r => `${pxtc.assembler.tohex(r.start)} (${r.length / 1024}kB)`)
                        .join(", "));
                let unchangedAddr = (a) => regionsOk.some(r => r.start <= a && a < r.start + r.length);
                return blocks.filter(b => !(unchangedAddr(b.targetAddr) &&
                    unchangedAddr(b.targetAddr + b.payloadSize - 1)));
            });
        }
        HF2.onlyChangedBlocksAsync = onlyChangedBlocksAsync;
    })(HF2 = pxt.HF2 || (pxt.HF2 = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var HWDBG;
    (function (HWDBG) {
        var U = pxt.Util;
        var H = pxt.HF2;
        const HF2_DBG_GET_GLOBAL_STATE = 0x53fc66e0;
        const HF2_DBG_RESUME = 0x27a55931;
        const HF2_DBG_RESTART = 0x1120bd93;
        const HF2_DBG_GET_STACK = 0x70901510;
        const HF2_EV_DBG_PAUSED = 0x3692f9fd;
        const r32 = H.read32;
        let isHalted = false;
        let lastCompileResult;
        let onHalted;
        let haltHandler;
        let cachedStaticState;
        let currBreakpoint;
        let callInfos;
        let lastFlash;
        let hid;
        function taggedSpecialValue(n) { return (n << 2) | 2; }
        HWDBG.taggedUndefined = 0;
        HWDBG.taggedNull = taggedSpecialValue(1);
        HWDBG.taggedFalse = taggedSpecialValue(2);
        HWDBG.taggedTrue = taggedSpecialValue(16);
        HWDBG.postMessage = msg => console.log(msg);
        function clearAsync() {
            isHalted = false;
            lastCompileResult = null;
            cachedStaticState = null;
            return Promise.resolve();
        }
        function decodeValue(n) {
            if (n & 1)
                return n >> 1;
            if (n == 0)
                return undefined;
            if (n & 2) {
                if (n == HWDBG.taggedNull)
                    return null;
                if (n == HWDBG.taggedFalse)
                    return false;
                if (n == HWDBG.taggedTrue)
                    return true;
                return { tagged: n >> 2 };
            }
            return { ptr: n };
        }
        HWDBG.decodeValue = decodeValue;
        function readMemAsync(addr, numbytes) {
            U.assert(!(addr & 3));
            U.assert(addr >= 0);
            if (addr < 2 * 1024 * 1024) {
                // assume these sit in flash
                let res = new Uint8Array(numbytes);
                addr -= lastFlash.start;
                U.memcpy(res, 0, lastFlash.buf, addr, numbytes);
                return Promise.resolve(res);
            }
            let maxBytes = hid.maxMsgSize - 32;
            if (numbytes > maxBytes) {
                let promises = [];
                while (numbytes > 0) {
                    let n = Math.min(maxBytes, numbytes);
                    promises.push(readMemAsync(addr, n));
                    numbytes -= n;
                    addr += n;
                }
                return Promise.all(promises)
                    .then(U.uint8ArrayConcat);
            }
            else {
                return hid.readWordsAsync(addr, Math.ceil(numbytes / 4))
                    .then(rr => {
                    if (rr.length > numbytes)
                        return rr.slice(0, numbytes);
                    else
                        return rr;
                });
            }
        }
        function heapExpandAsync(v) {
            if (typeof v != "object" || !v)
                return Promise.resolve(v);
            if (typeof v.ptr == "number") {
                // there should be no unaligned pointers
                if (v.ptr & 3)
                    return Promise.resolve({ unalignedPtr: v.ptr });
                let tag = 0;
                // 56 bytes of data fit in one HID packet (with 5 bytes of header and 3 bytes of padding)
                return readMemAsync(v.ptr, 56)
                    .then(buf => {
                    // TODO this is wrong, with the new vtable format
                    tag = H.read16(buf, 2);
                    let neededLength = buf.length;
                    if (tag == pxt.BuiltInType.BoxedString || tag == pxt.BuiltInType.BoxedBuffer) {
                        neededLength = H.read16(buf, 4) + 6;
                    }
                    else if (tag == pxt.BuiltInType.BoxedNumber) {
                        neededLength = 8 + 4;
                    }
                    else {
                        // TODO
                    }
                    if (neededLength > buf.length) {
                        return readMemAsync(v.ptr + buf.length, neededLength - buf.length)
                            .then(secondary => U.uint8ArrayConcat([buf, secondary]));
                    }
                    else if (neededLength < buf.length) {
                        return buf.slice(0, neededLength);
                    }
                    else {
                        return buf;
                    }
                })
                    .then(buf => {
                    if (tag == pxt.BuiltInType.BoxedString)
                        return U.uint8ArrayToString(buf.slice(6));
                    else if (tag == pxt.BuiltInType.BoxedBuffer)
                        return { type: "buffer", data: buf.slice(6) };
                    else if (tag == pxt.BuiltInType.BoxedNumber)
                        return new Float64Array(buf.buffer.slice(4))[0];
                    else
                        return {
                            type: "unknown",
                            tag: tag,
                            refcnt: H.read16(buf, 0),
                            data: buf.slice(4)
                        };
                });
            }
            else {
                return Promise.resolve(v);
            }
        }
        HWDBG.heapExpandAsync = heapExpandAsync;
        function heapExpandMapAsync(vars) {
            let promises = [];
            for (let k of Object.keys(vars)) {
                promises.push(heapExpandAsync(vars[k])
                    .then((r) => {
                    vars[k] = r;
                    //console.log("set", k, "to", r, "prev", vars[k], "NOW", vars)
                }));
            }
            return Promise.all(promises)
                .then(() => {
                //console.log("FIN", vars)
            });
        }
        HWDBG.heapExpandMapAsync = heapExpandMapAsync;
        function buildFrames(stack, msg) {
            let currAddr = currBreakpoint.binAddr;
            let sp = 0;
            let pi = lastCompileResult.procDebugInfo.filter(p => p.codeStartLoc <= currAddr && currAddr <= p.codeEndLoc)[0];
            while (true) {
                if (!pi)
                    break; // ???
                if (pi == lastCompileResult.procDebugInfo[0])
                    break; // main
                let bp = findPrevBrkp(currAddr);
                let info = U.clone(bp);
                info.functionName = pi.name;
                info.argumentNames = pi.args && pi.args.map(a => a.name);
                msg.stackframes.push({
                    locals: {},
                    funcInfo: info,
                    breakpointId: bp.id,
                });
                let frame = msg.stackframes[msg.stackframes.length - 1];
                let idx = 0;
                for (let l of pi.locals) {
                    U.assert(l.index == idx++);
                    frame.locals[l.name] = decodeValue(stack[sp++]);
                }
                currAddr = stack[sp++] & 0x7ffffffe;
                let ci = callInfos[currAddr + ""];
                for (let l of pi.args) {
                    frame.locals[l.name] = decodeValue(stack[sp + (pi.args.length - 1 - l.index)]);
                }
                if (!ci)
                    break;
                pi = ci.from;
                sp += ci.stack - pi.localsMark;
            }
        }
        function findPrevBrkp(addr) {
            let bb = lastCompileResult.breakpoints;
            let brkMatch = bb[0];
            let bestDelta = Infinity;
            for (let b of bb) {
                let delta = addr - b.binAddr;
                // console.log(`${b.line+1}: addr=${b.binAddr} d=${delta}`)
                if (delta >= 0 && delta < bestDelta) {
                    bestDelta = delta;
                    brkMatch = b;
                }
            }
            return brkMatch;
        }
        function corePaused(buf) {
            if (isHalted)
                return Promise.resolve();
            isHalted = true;
            let msg;
            return getHwStateAsync()
                .then(st => {
                let w = H.decodeU32LE(buf);
                let pc = w[0];
                let globals = {};
                for (let l of lastCompileResult.procDebugInfo[0].locals) {
                    let gbuf = st.globals;
                    let readV = () => {
                        switch (l.type) {
                            case "uint32": return H.read32(gbuf, l.index);
                            case "int32": return H.read32(gbuf, l.index) | 0;
                            case "uint16": return H.read16(gbuf, l.index);
                            case "int16": return (H.read16(gbuf, l.index) << 16) >> 16;
                            case "uint8": return gbuf[l.index];
                            case "int8": return (gbuf[l.index] << 24) >> 24;
                            default: return null;
                        }
                    };
                    let v = readV();
                    if (v === null) {
                        U.assert((l.index & 3) == 0);
                        v = decodeValue(H.read32(gbuf, l.index));
                    }
                    globals[l.name] = v;
                }
                currBreakpoint = findPrevBrkp(pc);
                msg = {
                    type: 'debugger',
                    subtype: 'breakpoint',
                    breakpointId: currBreakpoint.id,
                    globals: globals,
                    stackframes: []
                };
                haltHandler();
                return hid.talkAsync(HF2_DBG_GET_STACK);
            })
                .then(stack => {
                buildFrames(H.decodeU32LE(stack), msg);
                let maps = [msg.globals].concat(msg.stackframes.map(s => s.locals));
                return U.promiseMapAll(maps, heapExpandMapAsync);
            })
                .then(() => HWDBG.postMessage(msg));
        }
        function clearHalted() {
            isHalted = false;
            onHalted = new Promise((resolve, reject) => {
                haltHandler = resolve;
            });
        }
        function startDebugAsync(compileRes, hidWr) {
            hid = hidWr;
            hid.onEvent(HF2_EV_DBG_PAUSED, corePaused);
            return clearAsync()
                .then(() => {
                lastCompileResult = compileRes;
                callInfos = {};
                let procLookup = [];
                for (let pdi of compileRes.procDebugInfo) {
                    procLookup[pdi.idx] = pdi;
                }
                for (let pdi of compileRes.procDebugInfo) {
                    //console.log(pdi)
                    for (let ci of pdi.calls) {
                        callInfos[ci.addr + ""] = {
                            from: pdi,
                            to: procLookup[ci.procIndex],
                            stack: ci.stack
                        };
                    }
                }
            })
                .then(() => {
                let f = lastCompileResult.outfiles[pxtc.BINARY_UF2];
                let blockBuf = U.stringToUint8Array(atob(f));
                lastFlash = pxtc.UF2.toBin(blockBuf);
                return hid.reflashAsync(lastCompileResult)
                    .then(() => hid.reconnectAsync()); // this will reset into app at the end
            })
                .then(() => hid.talkAsync(HF2_DBG_RESTART).catch(e => { }))
                .then(() => U.delay(200))
                .then(() => hid.reconnectAsync())
                .then(clearHalted)
                .then(waitForHaltAsync);
        }
        HWDBG.startDebugAsync = startDebugAsync;
        function handleMessage(msg) {
            console.log("HWDBGMSG", msg);
            if (msg.type != "debugger")
                return;
            let stepInto = false;
            switch (msg.subtype) {
                case 'stepinto':
                    stepInto = true;
                case 'stepover':
                    resumeAsync(stepInto);
                    break;
            }
        }
        HWDBG.handleMessage = handleMessage;
        function resumeAsync(into = false) {
            return Promise.resolve()
                .then(() => hid.talkAsync(HF2_DBG_RESUME, H.encodeU32LE([into ? 1 : 3])))
                .then(clearHalted);
        }
        HWDBG.resumeAsync = resumeAsync;
        function waitForHaltAsync() {
            if (!onHalted)
                onHalted = Promise.resolve();
            return onHalted;
        }
        HWDBG.waitForHaltAsync = waitForHaltAsync;
        function getStaticStateAsync() {
            if (cachedStaticState)
                return Promise.resolve(cachedStaticState);
            return hid.talkAsync(HF2_DBG_GET_GLOBAL_STATE)
                .then(buf => (cachedStaticState = {
                numGlobals: r32(buf, 0),
                globalsPtr: r32(buf, 4)
            }));
        }
        function getHwStateAsync() {
            return getStaticStateAsync()
                .then(st => hid.readWordsAsync(st.globalsPtr, st.numGlobals))
                .then(buf => {
                let res = {
                    staticState: cachedStaticState,
                    globals: buf
                };
                return res;
            });
        }
        HWDBG.getHwStateAsync = getHwStateAsync;
    })(HWDBG = pxt.HWDBG || (pxt.HWDBG = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    // Converts encoded JRES images into PNG data uris
    // this keeps a bit of state for perf reasons
    class ImageConverter {
        logTime() {
            if (this.start) {
                let d = Date.now() - this.start;
                pxt.debug("Icon creation: " + d + "ms");
            }
        }
        convert(jresURL) {
            if (!this.start)
                this.start = Date.now();
            let data = atob(jresURL.slice(jresURL.indexOf(",") + 1));
            let magic = data.charCodeAt(0);
            let w = data.charCodeAt(1);
            let h = data.charCodeAt(2);
            if (magic === 0x87) {
                magic = 0xe0 | data.charCodeAt(1);
                w = data.charCodeAt(2) | (data.charCodeAt(3) << 8);
                h = data.charCodeAt(4) | (data.charCodeAt(5) << 8);
                data = data.slice(4);
            }
            if (magic != 0xe1 && magic != 0xe4)
                return null;
            function htmlColorToBytes(hexColor) {
                const v = parseInt(hexColor.replace(/#/, ""), 16);
                return [(v >> 0) & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, 0xff];
            }
            if (!this.palette) {
                let arrs = pxt.appTarget.runtime.palette.map(htmlColorToBytes);
                // Set the alpha for transparency at index 0
                arrs[0][3] = 0;
                this.palette = new Uint8Array(arrs.length * 4);
                for (let i = 0; i < arrs.length; ++i) {
                    this.palette[i * 4 + 0] = arrs[i][0];
                    this.palette[i * 4 + 1] = arrs[i][1];
                    this.palette[i * 4 + 2] = arrs[i][2];
                    this.palette[i * 4 + 3] = arrs[i][3];
                }
            }
            if (magic == 0xe1) {
                return this.genMonochrome(data, w, h);
            }
            const scaleFactor = ((pxt.BrowserUtils.isEdge() || pxt.BrowserUtils.isIE()) && w < 100 && h < 100) ? 3 : 1;
            return this.genColor(data, w, h, scaleFactor);
        }
        genMonochrome(data, w, h) {
            let outByteW = (w + 3) & ~3;
            let bmpHeaderSize = 14 + 40 + this.palette.length;
            let bmpSize = bmpHeaderSize + outByteW * h;
            let bmp = new Uint8Array(bmpSize);
            bmp[0] = 66;
            bmp[1] = 77;
            pxt.HF2.write32(bmp, 2, bmpSize);
            pxt.HF2.write32(bmp, 10, bmpHeaderSize);
            pxt.HF2.write32(bmp, 14, 40); // size of this header
            pxt.HF2.write32(bmp, 18, w);
            pxt.HF2.write32(bmp, 22, -h); // not upside down
            pxt.HF2.write16(bmp, 26, 1); // 1 color plane
            pxt.HF2.write16(bmp, 28, 8); // 8bpp
            pxt.HF2.write32(bmp, 38, 2835); // 72dpi
            pxt.HF2.write32(bmp, 42, 2835);
            pxt.HF2.write32(bmp, 46, this.palette.length >> 2);
            bmp.set(this.palette, 54);
            let inP = 4;
            let outP = bmpHeaderSize;
            let mask = 0x01;
            let v = data.charCodeAt(inP++);
            for (let x = 0; x < w; ++x) {
                outP = bmpHeaderSize + x;
                for (let y = 0; y < h; ++y) {
                    bmp[outP] = (v & mask) ? 1 : 0;
                    outP += outByteW;
                    mask <<= 1;
                    if (mask == 0x100) {
                        mask = 0x01;
                        v = data.charCodeAt(inP++);
                    }
                }
            }
            return "data:image/bmp;base64," + btoa(pxt.U.uint8ArrayToString(bmp));
        }
        genColor(data, width, height, intScale) {
            intScale = Math.max(1, intScale | 0);
            const w = width * intScale;
            const h = height * intScale;
            let outByteW = w << 2;
            let bmpHeaderSize = 138;
            let bmpSize = bmpHeaderSize + outByteW * h;
            let bmp = new Uint8Array(bmpSize);
            bmp[0] = 66;
            bmp[1] = 77;
            pxt.HF2.write32(bmp, 2, bmpSize);
            pxt.HF2.write32(bmp, 10, bmpHeaderSize);
            pxt.HF2.write32(bmp, 14, 124); // size of this header
            pxt.HF2.write32(bmp, 18, w);
            pxt.HF2.write32(bmp, 22, -h); // not upside down
            pxt.HF2.write16(bmp, 26, 1); // 1 color plane
            pxt.HF2.write16(bmp, 28, 32); // 32bpp
            pxt.HF2.write16(bmp, 30, 3); // magic?
            pxt.HF2.write32(bmp, 38, 2835); // 72dpi
            pxt.HF2.write32(bmp, 42, 2835);
            pxt.HF2.write32(bmp, 54, 0xff0000); // Red bitmask
            pxt.HF2.write32(bmp, 58, 0xff00); // Green bitmask
            pxt.HF2.write32(bmp, 62, 0xff); // Blue bitmask
            pxt.HF2.write32(bmp, 66, 0xff000000); // Alpha bitmask
            // Color space (sRGB)
            bmp[70] = 0x42; // B
            bmp[71] = 0x47; // G
            bmp[72] = 0x52; // R
            bmp[73] = 0x73; // s
            let inP = 4;
            let outP = bmpHeaderSize;
            let isTransparent = true;
            for (let x = 0; x < w; x++) {
                let high = false;
                outP = bmpHeaderSize + (x << 2);
                let columnStart = inP;
                let v = data.charCodeAt(inP++);
                let colorStart = high ? (((v >> 4) & 0xf) << 2) : ((v & 0xf) << 2);
                for (let y = 0; y < h; y++) {
                    if (v)
                        isTransparent = false;
                    bmp[outP] = this.palette[colorStart];
                    bmp[outP + 1] = this.palette[colorStart + 1];
                    bmp[outP + 2] = this.palette[colorStart + 2];
                    bmp[outP + 3] = this.palette[colorStart + 3];
                    outP += outByteW;
                    if (y % intScale === intScale - 1) {
                        if (high) {
                            v = data.charCodeAt(inP++);
                        }
                        high = !high;
                        colorStart = high ? (((v >> 4) & 0xf) << 2) : ((v & 0xf) << 2);
                    }
                }
                if (isTransparent) {
                    // If all pixels are completely transparent, browsers won't render the image properly;
                    // set one pixel to be slightly opaque to fix that
                    bmp[bmpHeaderSize + 3] = 1;
                }
                if (x % intScale === intScale - 1) {
                    if (!(height % 2))
                        --inP;
                    while (inP & 3)
                        inP++;
                }
                else {
                    inP = columnStart;
                }
            }
            return "data:image/bmp;base64," + btoa(pxt.U.uint8ArrayToString(bmp));
        }
    }
    pxt.ImageConverter = ImageConverter;
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var template;
    (function (template) {
        template.TS_CONFIG = `{
    "compilerOptions": {
        "target": "ES5",
        "noImplicitAny": true,
        "outDir": "built",
        "rootDir": "."
    },
    "exclude": ["pxt_modules/**/*test.ts"]
}
`;
        function defaultFiles() {
            const files = {
                "tsconfig.json": template.TS_CONFIG,
                "test.ts": `// ${lf("tests go here; this will not be compiled when this package is used as an extension.")}
`,
                "_config.yml": `makecode:
  target: @TARGET@
  platform: @PLATFORM@
  home_url: @HOMEURL@
theme: jekyll-theme-slate
include:
  - assets
  - README.md
`,
                "Makefile": `all: deploy

build:
\tpxt build

deploy:
\tpxt deploy

test:
\tpxt test
`,
                "Gemfile": `source 'https://rubygems.org'
gem 'github-pages', group: :jekyll_plugins`,
                "README.md": `
> ${lf("Open this page at {0}", "[https://@REPOOWNER@.github.io/@REPONAME@/](https://@REPOOWNER@.github.io/@REPONAME@/)")}

## ${lf("Use as Extension")}

${lf("This repository can be added as an **extension** in MakeCode.")}

* ${lf("open [@HOMEURL@](@HOMEURL@)")}
* ${lf("click on **New Project**")}
* ${lf("click on **Extensions** under the gearwheel menu")}
* ${lf("search for **https://github.com/@REPO@** and import")}

## ${lf("Edit this project")} ![${lf("Build status badge")}](https://github.com/@REPO@/workflows/MakeCode/badge.svg)

${lf("To edit this repository in MakeCode.")}

* ${lf("open [@HOMEURL@](@HOMEURL@)")}
* ${lf("click on **Import** then click on **Import URL**")}
* ${lf("paste **https://github.com/@REPO@** and click import")}

## ${lf("Blocks preview")}

${lf("This image shows the blocks code from the last commit in master.")}
${lf("This image may take a few minutes to refresh.")}

![${lf("A rendered view of the blocks")}](https://github.com/@REPO@/raw/master/.github/makecode/blocks.png)

#### ${lf("Metadata (used for search, rendering)")}

* for PXT/@TARGET@
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
`,
                ".gitignore": `# MakeCode
built
node_modules
yotta_modules
yotta_targets
pxt_modules
_site
*.db
*.tgz
.header.json
.simstate.json
`,
                ".vscode/settings.json": `{
    "editor.formatOnType": true,
    "files.autoSave": "afterDelay",
    "files.watcherExclude": {
        "**/.git/objects/**": true,
        "**/built/**": true,
        "**/node_modules/**": true,
        "**/yotta_modules/**": true,
        "**/yotta_targets": true,
        "**/pxt_modules/**": true
    },
    "files.associations": {
        "*.blocks": "html",
        "*.jres": "json"
    },
    "search.exclude": {
        "**/built": true,
        "**/node_modules": true,
        "**/yotta_modules": true,
        "**/yotta_targets": true,
        "**/pxt_modules": true
    }
}`,
                ".github/workflows/makecode.yml": `name: MakeCode

on: [push]

jobs:
  build:

    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [14.x]

    steps:
      - uses: actions/checkout@v1
      - name: Use Node.js $\{{ matrix.node-version }}
        uses: actions/setup-node@v1
        with:
          node-version: $\{{ matrix.node-version }}
      - name: npm install
        run: |
          npm install -g pxt
          pxt target @TARGET@
      - name: build
        run: |
          pxt install
          pxt build --cloud
        env:
          CI: true
`,
                ".github/workflows/cfg-check.yml": `name: Check pxt.json

on:
  push:
    branches:
      - 'master'
      - 'main'

jobs:
  check-cfg:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [14.x]
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js $\{{ matrix.node-version }}
        uses: actions/setup-node@v1
        with:
          node-version: $\{{ matrix.node-version }}
      - name: npm install
        run: |
          npm install -g pxt
          pxt target @TARGET@
      - name: Checkout current state
        run: |
          git checkout -- .
          git clean -fd
      - name: Fix files listed in config if necessary
        run: pxt checkpkgcfg
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        continue-on-error: true
        with:
          title: 'Removing missing files from pxt.json'
          commit-message: 'Removing missing files from pxt.json'
          delete-branch: true
`,
                ".vscode/tasks.json": `
// A task runner that calls the MakeCode (PXT) compiler
{
    "version": "2.0.0",
    "tasks": [{
        "label": "pxt deploy",
        "type": "shell",
        "command": "pxt deploy --local",
        "group": "build",
        "problemMatcher": [ "$tsc" ]
    }, {
        "label": "pxt build",
        "type": "shell",
        "command": "pxt build --local",
        "group": "build",
        "problemMatcher": [ "$tsc" ]
    }, {
        "label": "pxt install",
        "type": "shell",
        "command": "pxt install",
        "group": "build",
        "problemMatcher": [ "$tsc" ]
    }, {
        "label": "pxt clean",
        "type": "shell",
        "command": "pxt clean",
        "group": "test",
        "problemMatcher": [ "$tsc" ]
    }]
}
`
            };
            // override files from target
            const overrides = targetTemplateFiles();
            if (overrides) {
                Object.keys(overrides)
                    .forEach(k => files[k] = overrides[k]);
            }
            return files;
        }
        template.defaultFiles = defaultFiles;
        function targetTemplateFiles() {
            const overrides = pxt.appTarget.bundledpkgs[pxt.template.TEMPLATE_PRJ];
            if (overrides) {
                const r = pxt.Util.clone(overrides);
                delete r[pxt.CONFIG_NAME];
                return r;
            }
            return undefined;
        }
        template.targetTemplateFiles = targetTemplateFiles;
        template.TEMPLATE_PRJ = "template";
        function packageFiles(name) {
            const prj = pxt.appTarget.blocksprj || pxt.appTarget.tsprj;
            const config = pxt.U.clone(prj.config);
            // clean up
            delete config.installedVersion;
            delete config.additionalFilePath;
            delete config.additionalFilePaths;
            // (keep blocks files)
            config.preferredEditor = config.files.find(f => /\.blocks$/.test(f))
                ? pxt.BLOCKS_PROJECT_NAME : pxt.JAVASCRIPT_PROJECT_NAME;
            config.name = name;
            config.public = true;
            if (!config.version)
                config.version = "0.0.0";
            const files = {};
            const defFiles = defaultFiles();
            for (const f in defFiles)
                files[f] = defFiles[f];
            for (const f in prj.files)
                if (f != "README.md") // this one we need to keep
                    files[f] = prj.files[f];
            const pkgFiles = Object.keys(files).filter(s => /\.(blocks|md|ts|asm|cpp|h|py)$/.test(s));
            config.files = pkgFiles.filter(s => !/test/.test(s));
            config.testFiles = pkgFiles.filter(s => /test/.test(s));
            config.supportedTargets = [pxt.appTarget.id];
            files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(config);
            return files;
        }
        template.packageFiles = packageFiles;
        function packageFilesFixup(files, options) {
            const configMap = JSON.parse(files[pxt.CONFIG_NAME]);
            if (options)
                pxt.Util.jsonMergeFrom(configMap, options);
            if (pxt.webConfig) { // CLI
                Object.keys(pxt.webConfig).forEach(k => configMap[k.toLowerCase()] = pxt.webConfig[k]);
                configMap["platform"] = pxt.appTarget.platformid || pxt.appTarget.id;
                configMap["target"] = pxt.appTarget.id;
                configMap["docs"] = pxt.appTarget.appTheme.homeUrl || "./";
                configMap["homeurl"] = pxt.appTarget.appTheme.homeUrl || "???";
            }
            pxt.U.iterMap(files, (k, v) => {
                v = v.replace(/@([A-Z]+)@/g, (f, n) => configMap[n.toLowerCase()] || "");
                files[k] = v;
            });
        }
        template.packageFilesFixup = packageFilesFixup;
    })(template = pxt.template || (pxt.template = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var blocks;
    (function (blocks) {
        let NT;
        (function (NT) {
            NT[NT["Prefix"] = 0] = "Prefix";
            NT[NT["Postfix"] = 1] = "Postfix";
            NT[NT["Infix"] = 2] = "Infix";
            NT[NT["Block"] = 3] = "Block";
            NT[NT["NewLine"] = 4] = "NewLine";
        })(NT = blocks.NT || (blocks.NT = {}));
        let GlueMode;
        (function (GlueMode) {
            GlueMode[GlueMode["None"] = 0] = "None";
            GlueMode[GlueMode["WithSpace"] = 1] = "WithSpace";
            GlueMode[GlueMode["NoSpace"] = 2] = "NoSpace";
        })(GlueMode = blocks.GlueMode || (blocks.GlueMode = {}));
        const reservedWords = ["break", "case", "catch", "class", "const", "continue", "debugger",
            "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally",
            "for", "function", "if", "import", "in", "instanceof", "new", "null", "return",
            "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while",
            "with"];
        let placeholders = {};
        function backtickLit(s) {
            return "`" + s.replace(/[\\`${}]/g, f => "\\" + f) + "`";
        }
        blocks.backtickLit = backtickLit;
        function stringLit(s) {
            if (s.length > 20 && /\n/.test(s))
                return backtickLit(s);
            else
                return JSON.stringify(s);
        }
        blocks.stringLit = stringLit;
        function mkNode(tp, pref, children) {
            return {
                type: tp,
                op: pref,
                children: children
            };
        }
        blocks.mkNode = mkNode;
        function mkNewLine() {
            return mkNode(NT.NewLine, "", []);
        }
        blocks.mkNewLine = mkNewLine;
        function mkPrefix(pref, children) {
            return mkNode(NT.Prefix, pref, children);
        }
        blocks.mkPrefix = mkPrefix;
        function mkPostfix(children, post) {
            return mkNode(NT.Postfix, post, children);
        }
        blocks.mkPostfix = mkPostfix;
        function mkInfix(child0, op, child1) {
            return mkNode(NT.Infix, op, child0 == null ? [child1] : [child0, child1]);
        }
        blocks.mkInfix = mkInfix;
        function mkText(s) {
            return mkPrefix(s, []);
        }
        blocks.mkText = mkText;
        function mkBlock(nodes) {
            return mkNode(NT.Block, "", nodes);
        }
        blocks.mkBlock = mkBlock;
        function mkGroup(nodes) {
            return mkPrefix("", nodes);
        }
        blocks.mkGroup = mkGroup;
        function mkStmt(...nodes) {
            let last = nodes[nodes.length - 1];
            if (last && last.type == NT.Block) {
                // OK - no newline needed
            }
            else {
                nodes.push(mkNewLine());
            }
            return mkGroup(nodes);
        }
        blocks.mkStmt = mkStmt;
        function mkCommaSep(nodes, withNewlines = false) {
            const r = [];
            for (const n of nodes) {
                if (withNewlines) {
                    if (r.length > 0)
                        r.push(mkText(","));
                    r.push(mkNewLine());
                }
                else if (r.length > 0) {
                    r.push(mkText(", "));
                }
                r.push(n);
            }
            if (withNewlines)
                r.push(mkNewLine());
            return mkGroup(r);
        }
        blocks.mkCommaSep = mkCommaSep;
        // A series of utility functions for constructing various J* AST nodes.
        let Helpers;
        (function (Helpers) {
            function mkArrayLiteral(args, withNewlines) {
                return mkGroup([
                    mkText("["),
                    mkCommaSep(args, withNewlines),
                    mkText("]")
                ]);
            }
            Helpers.mkArrayLiteral = mkArrayLiteral;
            function mkNumberLiteral(x) {
                return mkText(x.toString());
            }
            Helpers.mkNumberLiteral = mkNumberLiteral;
            function mkBooleanLiteral(x) {
                return mkText(x ? "true" : "false");
            }
            Helpers.mkBooleanLiteral = mkBooleanLiteral;
            function mkStringLiteral(x) {
                return mkText(stringLit(x));
            }
            Helpers.mkStringLiteral = mkStringLiteral;
            function mkPropertyAccess(name, thisArg) {
                return mkGroup([
                    mkInfix(thisArg, ".", mkText(name)),
                ]);
            }
            Helpers.mkPropertyAccess = mkPropertyAccess;
            function mkCall(name, args, externalInputs = false, method = false) {
                if (method)
                    return mkGroup([
                        mkInfix(args[0], ".", mkText(name)),
                        mkText("("),
                        mkCommaSep(args.slice(1), externalInputs),
                        mkText(")")
                    ]);
                else
                    return mkGroup([
                        mkText(name),
                        mkText("("),
                        mkCommaSep(args, externalInputs),
                        mkText(")")
                    ]);
            }
            Helpers.mkCall = mkCall;
            // Call function [name] from the standard device library with arguments
            // [args].
            function stdCall(name, args, externalInputs) {
                return mkCall(name, args, externalInputs);
            }
            Helpers.stdCall = stdCall;
            // Call extension method [name] on the first argument
            function extensionCall(name, args, externalInputs) {
                return mkCall(name, args, externalInputs, true);
            }
            Helpers.extensionCall = extensionCall;
            // Call function [name] from the specified [namespace] in the micro:bit
            // library.
            function namespaceCall(namespace, name, args, externalInputs) {
                return mkCall(namespace + "." + name, args, externalInputs);
            }
            Helpers.namespaceCall = namespaceCall;
            function mathCall(name, args) {
                return namespaceCall("Math", name, args, false);
            }
            Helpers.mathCall = mathCall;
            function mkGlobalRef(name) {
                return mkText(name);
            }
            Helpers.mkGlobalRef = mkGlobalRef;
            function mkSimpleCall(p, args) {
                pxt.U.assert(args.length == 2);
                return mkInfix(args[0], p, args[1]);
            }
            Helpers.mkSimpleCall = mkSimpleCall;
            function mkWhile(condition, body) {
                return mkGroup([
                    mkText("while ("),
                    condition,
                    mkText(")"),
                    mkBlock(body)
                ]);
            }
            Helpers.mkWhile = mkWhile;
            function mkComment(text) {
                return mkText("// " + text);
            }
            Helpers.mkComment = mkComment;
            function mkMultiComment(text) {
                let group = [
                    mkText("/**"),
                    mkNewLine()
                ];
                text.split("\n").forEach((c, i, arr) => {
                    if (c) {
                        group.push(mkText(" * " + c));
                        group.push(mkNewLine());
                        // Add an extra line so we can convert it back to new lines
                        if (i < arr.length - 1) {
                            group.push(mkText(" * "));
                            group.push(mkNewLine());
                        }
                    }
                });
                return mkGroup(group.concat([
                    mkText(" */"),
                    mkNewLine()
                ]));
            }
            Helpers.mkMultiComment = mkMultiComment;
            function mkAssign(x, e) {
                return mkSimpleCall("=", [x, e]);
            }
            Helpers.mkAssign = mkAssign;
            function mkParenthesizedExpression(expression) {
                return isParenthesized(flattenNode([expression]).output) ? expression : mkGroup([mkText("("), expression, mkText(")")]);
            }
            Helpers.mkParenthesizedExpression = mkParenthesizedExpression;
        })(Helpers = blocks.Helpers || (blocks.Helpers = {}));
        blocks.H = Helpers;
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
        const infixPriTable = {
            // 0 = comma/sequence
            // 1 = spread (...)
            // 2 = yield, yield*
            // 3 = assignment
            "=": 3,
            "+=": 3,
            "-=": 3,
            "?": 4,
            ":": 4,
            "||": 5,
            "&&": 6,
            "|": 7,
            "^": 8,
            "&": 9,
            // 10 = equality
            "==": 10,
            "!=": 10,
            "===": 10,
            "!==": 10,
            // 11 = comparison (excludes in, instanceof)
            "<": 11,
            ">": 11,
            "<=": 11,
            ">=": 11,
            // 12 = bitwise shift
            ">>": 12,
            ">>>": 12,
            "<<": 12,
            "+": 13,
            "-": 13,
            "*": 14,
            "/": 14,
            "%": 14,
            "**": 15,
            "!": 16,
            "~": 16,
            "P-": 16,
            "P+": 16,
            "++": 16,
            "--": 16,
            ".": 18,
        };
        function flattenNode(app) {
            let sourceMap = [];
            let sourceMapById = {};
            let output = "";
            let indent = "";
            let variables = [{}];
            let currentLine = 0;
            function append(s) {
                // At runtime sometimes `s` is a number.
                if (typeof (s) === 'string') {
                    currentLine += (s.match(/\n/g) || []).length;
                }
                output += s;
            }
            function flatten(e0) {
                function rec(e, outPrio) {
                    if (e.type != NT.Infix) {
                        for (let c of e.children)
                            rec(c, -1);
                        return;
                    }
                    let r = [];
                    function pushOp(c) {
                        if (c[0] == "P")
                            c = c.slice(1);
                        r.push(mkText(c));
                    }
                    let infixPri = pxt.U.lookup(infixPriTable, e.op);
                    if (infixPri == null)
                        pxt.U.oops("bad infix op: " + e.op);
                    if (infixPri < outPrio)
                        pushOp("(");
                    if (e.children.length == 1) {
                        pushOp(e.op);
                        rec(e.children[0], infixPri);
                        r.push(e.children[0]);
                    }
                    else {
                        let bindLeft = infixPri != 3 && e.op != "**";
                        let letType = undefined;
                        rec(e.children[0], bindLeft ? infixPri : infixPri + 0.1);
                        r.push(e.children[0]);
                        if (letType && letType != "number") {
                            pushOp(": ");
                            pushOp(letType);
                        }
                        if (e.op == ".")
                            pushOp(".");
                        else
                            pushOp(" " + e.op + " ");
                        rec(e.children[1], !bindLeft ? infixPri : infixPri + 0.1);
                        r.push(e.children[1]);
                    }
                    if (infixPri < outPrio)
                        pushOp(")");
                    e.type = NT.Prefix;
                    e.op = "";
                    e.children = r;
                }
                rec(e0, -1);
            }
            let root = mkGroup(app);
            flatten(root);
            emit(root);
            // never return empty string - TS compiler service thinks it's an error
            if (!output)
                append("\n");
            return { output, sourceMap };
            function emit(n) {
                if (n.glueToBlock) {
                    removeLastIndent();
                    if (n.glueToBlock == GlueMode.WithSpace) {
                        append(" ");
                    }
                }
                let startLine = currentLine;
                let startPos = output.length;
                switch (n.type) {
                    case NT.Infix:
                        pxt.U.oops("no infix should be left");
                        break;
                    case NT.NewLine:
                        append("\n" + indent);
                        break;
                    case NT.Block:
                        block(n);
                        break;
                    case NT.Prefix:
                        if (n.canIndentInside)
                            append(n.op.replace(/\n/g, "\n" + indent + "    "));
                        else
                            append(n.op);
                        n.children.forEach(emit);
                        break;
                    case NT.Postfix:
                        n.children.forEach(emit);
                        if (n.canIndentInside)
                            append(n.op.replace(/\n/g, "\n" + indent + "    "));
                        else
                            append(n.op);
                        break;
                    default:
                        break;
                }
                let endLine = currentLine;
                // end position is non-inclusive
                let endPos = Math.max(output.length, 1);
                if (n.id) {
                    if (sourceMapById[n.id]) {
                        const node = sourceMapById[n.id];
                        node.startLine = Math.min(node.startLine, startLine);
                        node.endLine = Math.max(node.endLine, endLine);
                        node.startPos = Math.min(node.startPos, startPos);
                        node.endPos = Math.max(node.endPos, endPos);
                    }
                    else {
                        const interval = {
                            id: n.id,
                            startLine: startLine, startPos, endLine: endLine, endPos
                        };
                        sourceMapById[n.id] = interval;
                        sourceMap.push(interval);
                    }
                }
            }
            function write(s) {
                append(s.replace(/\n/g, "\n" + indent));
            }
            function removeLastIndent() {
                // Note: performance of this regular expression degrades with program size, and could therefore become a perf issue.
                output = output.replace(/\n *$/, function () {
                    currentLine--;
                    return "";
                });
            }
            function block(n) {
                let finalNl = n.noFinalNewline ? "" : "\n";
                if (n.children.length == 0) {
                    write(" {\n\t\n}" + finalNl);
                    return;
                }
                let vars = pxt.U.clone(variables[variables.length - 1] || {});
                variables.push(vars);
                indent += "    ";
                if (output[output.length - 1] != " ")
                    write(" ");
                write("{\n");
                for (let nn of n.children)
                    emit(nn);
                indent = indent.slice(4);
                removeLastIndent();
                write("\n}" + finalNl);
                variables.pop();
            }
        }
        blocks.flattenNode = flattenNode;
        function isReservedWord(str) {
            return reservedWords.indexOf(str) !== -1;
        }
        blocks.isReservedWord = isReservedWord;
        function isParenthesized(fnOutput) {
            if (fnOutput[0] !== "(" || fnOutput[fnOutput.length - 1] !== ")") {
                return false;
            }
            let unclosedParentheses = 1;
            for (let i = 1; i < fnOutput.length; i++) {
                const c = fnOutput[i];
                if (c === "(") {
                    unclosedParentheses++;
                }
                else if (c === ")") {
                    unclosedParentheses--;
                    if (unclosedParentheses === 0) {
                        return i === fnOutput.length - 1;
                    }
                }
            }
            return false;
        }
        blocks.isParenthesized = isParenthesized;
    })(blocks = pxt.blocks || (pxt.blocks = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var sprite;
    (function (sprite_1) {
        // These are the characters used to output literals (but we support aliases for some of these)
        const hexChars = [".", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
        sprite_1.BLOCKLY_TILESET_TYPE = "BLOCKLY_TILESET_TYPE";
        sprite_1.TILE_PREFIX = "tile";
        sprite_1.TILE_NAMESPACE = "myTiles";
        sprite_1.IMAGES_NAMESPACE = "myImages";
        sprite_1.IMAGE_PREFIX = "image";
        sprite_1.ANIMATION_NAMESPACE = "myAnimations";
        sprite_1.ANIMATION_PREFIX = "anim";
        /**
         * 16-color sprite
         */
        class Bitmap {
            constructor(width, height, x0 = 0, y0 = 0, buf) {
                this.width = width;
                this.height = height;
                this.x0 = x0;
                this.y0 = y0;
                if (!this.width)
                    this.width = 16;
                if (!this.height)
                    this.height = 16;
                this.buf = buf || new Uint8ClampedArray(this.dataLength());
            }
            static fromData(data) {
                return new Bitmap(data.width, data.height, data.x0, data.y0, data.data);
            }
            set(col, row, value) {
                if (col < this.width && row < this.height && col >= 0 && row >= 0) {
                    const index = this.coordToIndex(col, row);
                    this.setCore(index, value);
                }
            }
            get(col, row) {
                if (col < this.width && row < this.height && col >= 0 && row >= 0) {
                    const index = this.coordToIndex(col, row);
                    return this.getCore(index);
                }
                return 0;
            }
            copy(col = 0, row = 0, width = this.width, height = this.height) {
                const sub = new Bitmap(width, height);
                sub.x0 = col;
                sub.y0 = row;
                for (let c = 0; c < width; c++) {
                    for (let r = 0; r < height; r++) {
                        sub.set(c, r, this.get(col + c, row + r));
                    }
                }
                return sub;
            }
            apply(change, transparent = false) {
                let current;
                for (let c = 0; c < change.width; c++) {
                    for (let r = 0; r < change.height; r++) {
                        current = change.get(c, r);
                        if (!current && transparent)
                            continue;
                        this.set(change.x0 + c, change.y0 + r, current);
                    }
                }
            }
            equals(other) {
                if (this.width === other.width && this.height === other.height && this.x0 === other.x0 && this.y0 === other.y0 && this.buf.length === other.buf.length) {
                    for (let i = 0; i < this.buf.length; i++) {
                        if (this.buf[i] !== other.buf[i])
                            return false;
                    }
                    return true;
                }
                return false;
            }
            data() {
                return {
                    width: this.width,
                    height: this.height,
                    x0: this.x0,
                    y0: this.y0,
                    data: this.buf
                };
            }
            resize(width, height) {
                return resizeBitmap(this, width, height);
            }
            coordToIndex(col, row) {
                return col + row * this.width;
            }
            getCore(index) {
                const cell = Math.floor(index / 2);
                if (index % 2 === 0) {
                    return this.buf[cell] & 0xf;
                }
                else {
                    return (this.buf[cell] & 0xf0) >> 4;
                }
            }
            setCore(index, value) {
                const cell = Math.floor(index / 2);
                if (index % 2 === 0) {
                    this.buf[cell] = (this.buf[cell] & 0xf0) | (value & 0xf);
                }
                else {
                    this.buf[cell] = (this.buf[cell] & 0x0f) | ((value & 0xf) << 4);
                }
            }
            dataLength() {
                return Math.ceil(this.width * this.height / 2);
            }
        }
        sprite_1.Bitmap = Bitmap;
        class Tilemap extends Bitmap {
            static fromData(data) {
                return new Tilemap(data.width, data.height, data.x0, data.y0, data.data);
            }
            copy(col = 0, row = 0, width = this.width, height = this.height) {
                const sub = new Tilemap(width, height);
                sub.x0 = col;
                sub.y0 = row;
                for (let c = 0; c < width; c++) {
                    for (let r = 0; r < height; r++) {
                        sub.set(c, r, this.get(col + c, row + r));
                    }
                }
                return sub;
            }
            resize(width, height) {
                return resizeTilemap(this, width, height);
            }
            getCore(index) {
                return this.buf[index];
            }
            setCore(index, value) {
                this.buf[index] = value;
            }
            dataLength() {
                return this.width * this.height;
            }
        }
        sprite_1.Tilemap = Tilemap;
        class TilemapData {
            constructor(tilemap, tileset, layers) {
                this.tilemap = tilemap;
                this.tileset = tileset;
                this.layers = layers;
                this.nextId = 0;
            }
            cloneData() {
                const tm = this.tilemap.copy();
                const tileset = {
                    tileWidth: this.tileset.tileWidth,
                    tiles: this.tileset.tiles.map(t => (Object.assign(Object.assign({}, t), { bitmap: Bitmap.fromData(t.bitmap).copy().data() })))
                };
                const layers = Bitmap.fromData(this.layers).copy().data();
                return new TilemapData(tm, tileset, layers);
            }
            equals(other) {
                if (!(this.tilemap.equals(other.tilemap)
                    && this.tileset.tileWidth == other.tileset.tileWidth
                    && this.tileset.tiles.length == other.tileset.tiles.length
                    && bitmapEquals(this.layers, other.layers))) {
                    return false;
                }
                for (let i = 0; i < this.tileset.tiles.length; i++) {
                    if (!pxt.assetEquals(this.tileset.tiles[i], other.tileset.tiles[i]))
                        return false;
                }
                return true;
            }
        }
        sprite_1.TilemapData = TilemapData;
        class Bitmask {
            constructor(width, height) {
                this.width = width;
                this.height = height;
                this.mask = new Uint8Array(Math.ceil(width * height / 8));
            }
            set(col, row) {
                const cellIndex = col + this.width * row;
                const index = cellIndex >> 3;
                const offset = cellIndex & 7;
                this.mask[index] |= (1 << offset);
            }
            get(col, row) {
                const cellIndex = col + this.width * row;
                const index = cellIndex >> 3;
                const offset = cellIndex & 7;
                return (this.mask[index] >> offset) & 1;
            }
        }
        sprite_1.Bitmask = Bitmask;
        function encodeTilemap(t, fileType) {
            if (!t)
                return `null`;
            return `tiles.createTilemap(${tilemapToTilemapLiteral(t.tilemap)}, ${bitmapToImageLiteral(Bitmap.fromData(t.layers), fileType)}, [${t.tileset.tiles.map(tile => encodeTile(tile, fileType))}], ${tileWidthToTileScale(t.tileset.tileWidth)})`;
        }
        sprite_1.encodeTilemap = encodeTilemap;
        function decodeTilemap(literal, fileType, proj) {
            literal = pxt.Util.htmlUnescape(literal).trim();
            if (!literal.trim()) {
                return null;
            }
            literal = literal.substr(literal.indexOf("(") + 1);
            literal = literal.substr(0, literal.lastIndexOf(")"));
            const tm = literal.substr(0, literal.indexOf(","));
            literal = literal.substr(tm.length + 1);
            const layer = literal.substr(0, literal.indexOf(","));
            literal = literal.substr(layer.length + 1);
            const tileset = literal.substr(0, literal.lastIndexOf("]") + 1);
            literal = literal.substr(tileset.length + 1);
            const tilescale = literal;
            const result = new TilemapData(tilemapLiteralToTilemap(tm), {
                tiles: decodeTileset(tileset, proj),
                tileWidth: tileScaleToTileWidth(tilescale)
            }, imageLiteralToBitmap(layer).data());
            return result;
        }
        sprite_1.decodeTilemap = decodeTilemap;
        function trimTilemapTileset(t) {
            const oldTileset = t.tileset.tiles.slice();
            const tilemap = t.tilemap;
            const used = {};
            // Always keep transparency
            used[oldTileset[0].id] = true;
            for (let x = 0; x < tilemap.width; x++) {
                for (let y = 0; y < tilemap.height; y++) {
                    used[oldTileset[tilemap.get(x, y)].id] = true;
                }
            }
            const edited = t.editedTiles || [];
            // Tiles with names that start with * are new and haven't been recorded in the tilemap
            const newTileset = oldTileset.filter(tile => used[tile.id] ||
                tile.id.charAt(0) === "*" ||
                edited.indexOf(tile.id) !== -1);
            if (newTileset.length === oldTileset.length) {
                return;
            }
            const mapping = [];
            for (let i = 0; i < oldTileset.length; i++) {
                mapping.push(newTileset.indexOf(oldTileset[i]));
            }
            for (let x = 0; x < tilemap.width; x++) {
                for (let y = 0; y < tilemap.height; y++) {
                    tilemap.set(x, y, mapping[tilemap.get(x, y)]);
                }
            }
            t.tileset.tiles = newTileset;
            return;
        }
        sprite_1.trimTilemapTileset = trimTilemapTileset;
        function computeAverageColor(bitmap, colors) {
            const parsedColors = colors.map(colorStringToRGB);
            const averageColor = [0, 0, 0];
            let numPixels = 0;
            for (let x = 0; x < bitmap.width; x++) {
                for (let y = 0; y < bitmap.height; y++) {
                    const color = bitmap.get(x, y);
                    if (color) {
                        ++numPixels;
                        const parsedColor = parsedColors[color];
                        averageColor[0] += parsedColor[0];
                        averageColor[1] += parsedColor[1];
                        averageColor[2] += parsedColor[2];
                    }
                }
            }
            return !!numPixels ? "#" + toHex(averageColor.map(c => Math.floor(c / numPixels))) : "#00000000";
        }
        sprite_1.computeAverageColor = computeAverageColor;
        function getBitmap(blocksInfo, qName) {
            const sym = blocksInfo.apis.byQName[qName];
            if (!sym)
                return null;
            return getBitmapFromJResURL(sym.attributes.jresURL);
        }
        sprite_1.getBitmap = getBitmap;
        function getBitmapFromJResURL(jresURL) {
            return hexToBitmap(atob(jresURL.slice(jresURL.indexOf(",") + 1)));
        }
        sprite_1.getBitmapFromJResURL = getBitmapFromJResURL;
        function hexToBitmap(data) {
            let magic = data.charCodeAt(0);
            let w = data.charCodeAt(1);
            let h = data.charCodeAt(2);
            if (magic === 0x87) {
                magic = 0xe0 | data.charCodeAt(1);
                w = data.charCodeAt(2) | (data.charCodeAt(3) << 8);
                h = data.charCodeAt(4) | (data.charCodeAt(5) << 8);
                data = data.slice(4);
            }
            const out = new pxt.sprite.Bitmap(w, h);
            let index = 4;
            if (magic === 0xe1) {
                // Monochrome
                let mask = 0x01;
                let v = data.charCodeAt(index++);
                for (let x = 0; x < w; ++x) {
                    for (let y = 0; y < h; ++y) {
                        out.set(x, y, (v & mask) ? 1 : 0);
                        mask <<= 1;
                        if (mask == 0x100) {
                            mask = 0x01;
                            v = data.charCodeAt(index++);
                        }
                    }
                }
            }
            else {
                // Color
                for (let x = 0; x < w; x++) {
                    for (let y = 0; y < h; y += 2) {
                        let v = data.charCodeAt(index++);
                        out.set(x, y, v & 0xf);
                        if (y != h - 1) {
                            out.set(x, y + 1, (v >> 4) & 0xf);
                        }
                    }
                    while (index & 3)
                        index++;
                }
            }
            return out;
        }
        sprite_1.hexToBitmap = hexToBitmap;
        function filterItems(target, tags) {
            // Keep this unified with ImageFieldEditor:filterAssets
            tags = tags
                .filter(el => !!el)
                .map(el => el.toLowerCase());
            const includeTags = tags
                .filter(tag => tag.indexOf("!") !== 0);
            const excludeTags = tags
                .filter(tag => tag.indexOf("!") === 0 && tag.length > 1)
                .map(tag => tag.substring(1));
            return target.filter(el => checkInclude(el) && checkExclude(el));
            function checkInclude(item) {
                return includeTags.every(filterTag => {
                    const optFilterTag = `?${filterTag}`;
                    return item.tags.some(tag => tag === filterTag || tag === optFilterTag);
                });
            }
            function checkExclude(item) {
                return excludeTags.every(filterTag => !item.tags.some(tag => tag === filterTag));
            }
        }
        sprite_1.filterItems = filterItems;
        function getGalleryItems(blocksInfo, qName) {
            let syms = getFixedInstanceDropdownValues(blocksInfo.apis, qName);
            syms = syms.filter(s => s.namespace != sprite_1.TILE_NAMESPACE);
            generateIcons(syms);
            return syms.map(sym => {
                const splitTags = (sym.attributes.tags || "")
                    .split(" ")
                    .filter(el => !!el)
                    .map(tag => pxt.Util.startsWith(tag, "category-") ? tag : tag.toLowerCase());
                return {
                    qName: sym.qName,
                    src: sym.attributes.iconURL,
                    alt: sym.qName,
                    tags: splitTags
                };
            });
        }
        sprite_1.getGalleryItems = getGalleryItems;
        function base64EncodeBitmap(data) {
            const bitmap = Bitmap.fromData(data);
            const hex = pxtc.f4EncodeImg(data.width, data.height, 4, (x, y) => bitmap.get(x, y));
            return btoa(pxt.U.uint8ArrayToString(hexToUint8Array(hex)));
        }
        sprite_1.base64EncodeBitmap = base64EncodeBitmap;
        function getFixedInstanceDropdownValues(apis, qName) {
            return pxt.Util.values(apis.byQName).filter(sym => sym.kind === 4 /* Variable */
                && sym.attributes.fixedInstance
                && isSubtype(apis, sym.retType, qName));
        }
        function isSubtype(apis, specific, general) {
            if (specific == general)
                return true;
            let inf = apis.byQName[specific];
            if (inf && inf.extendsTypes)
                return inf.extendsTypes.indexOf(general) >= 0;
            return false;
        }
        function generateIcons(instanceSymbols) {
            const imgConv = new pxt.ImageConverter();
            instanceSymbols.forEach(v => {
                if (v.attributes.jresURL && !v.attributes.iconURL && v.attributes.jresURL.indexOf("data:image/x-mkcd-f") == 0) {
                    v.attributes.iconURL = imgConv.convert(v.attributes.jresURL);
                }
            });
        }
        function tilemapLiteralToTilemap(text, defaultPattern) {
            // Strip the tagged template string business and the whitespace. We don't have to exhaustively
            // replace encoded characters because the compiler will catch any disallowed characters and throw
            // an error before the decompilation happens. 96 is backtick and 9 is tab
            text = text.replace(/[ `]|(?:&#96;)|(?:&#9;)|(?:hex)/g, "").trim();
            text = text.replace(/^["`\(\)]*/, '').replace(/["`\(\)]*$/, '');
            text = text.replace(/&#10;/g, "\n");
            if (!text && defaultPattern)
                text = defaultPattern;
            const width = parseInt(text.substr(0, 2), 16) | (parseInt(text.substr(2, 2), 16) << 8);
            const height = parseInt(text.substr(4, 2), 16) | (parseInt(text.substr(6, 2), 16) << 8);
            const data = hexToUint8Array(text.substring(8));
            return Tilemap.fromData({
                width,
                height,
                x0: 0,
                y0: 0,
                data
            });
        }
        sprite_1.tilemapLiteralToTilemap = tilemapLiteralToTilemap;
        function tilemapToTilemapLiteral(t) {
            if (!t)
                return `hex\`\``;
            return `hex\`${hexEncodeTilemap(t)}\``;
        }
        function hexEncodeTilemap(t) {
            return `${formatByte(t.width, 2)}${formatByte(t.height, 2)}${uint8ArrayToHex(t.data().data)}`;
        }
        sprite_1.hexEncodeTilemap = hexEncodeTilemap;
        function decodeTileset(tileset, proj) {
            tileset = tileset.replace(/[\[\]]/g, "");
            return tileset ? tileset.split(",").filter(t => !!t.trim()).map(t => decodeTile(t, proj)) : [];
        }
        function encodeTile(tile, fileType) {
            return tile.id;
        }
        function decodeTile(literal, proj) {
            literal = literal.trim();
            if (literal.indexOf("img") === 0) {
                const bitmap = imageLiteralToBitmap(literal);
                return proj.createNewTile(bitmap.data());
            }
            switch (literal) {
                case "myTiles.tile0":
                case "myTiles.transparency16":
                    return proj.getTransparency(16);
                case "myTiles.transparency8":
                    return proj.getTransparency(8);
                case "myTiles.transparency32":
                    return proj.getTransparency(32);
                default:
                    return proj.resolveTile(literal);
            }
        }
        function formatByte(value, bytes) {
            let result = value.toString(16);
            const digits = bytes << 1;
            if (result.length & 1) {
                result = "0" + result;
            }
            while (result.length < digits) {
                result += "0";
            }
            return result;
        }
        sprite_1.formatByte = formatByte;
        function resizeBitmap(img, width, height) {
            const result = new Bitmap(width, height);
            result.apply(img);
            return result;
        }
        sprite_1.resizeBitmap = resizeBitmap;
        function resizeTilemap(img, width, height) {
            const result = new Tilemap(width, height);
            result.apply(img);
            return result;
        }
        sprite_1.resizeTilemap = resizeTilemap;
        function imageLiteralToBitmap(text) {
            // Strip the tagged template string business and the whitespace. We don't have to exhaustively
            // replace encoded characters because the compiler will catch any disallowed characters and throw
            // an error before the decompilation happens. 96 is backtick and 9 is tab
            text = text.replace(/[ `]|(?:&#96;)|(?:&#9;)|(?:img)/g, "").trim();
            text = text.replace(/^["`\(\)]*/, '').replace(/["`\(\)]*$/, '');
            text = text.replace(/&#10;/g, "\n");
            const rows = text.split("\n");
            // We support "ragged" sprites so not all rows will be the same length
            const sprite = [];
            let spriteWidth = 0;
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                const rowValues = [];
                for (let c = 0; c < row.length; c++) {
                    // This list comes from libs/screen/targetOverrides.ts in pxt-arcade
                    // Technically, this could change per target.
                    switch (row[c]) {
                        case "0":
                        case ".":
                            rowValues.push(0);
                            break;
                        case "1":
                        case "#":
                            rowValues.push(1);
                            break;
                        case "2":
                        case "T":
                            rowValues.push(2);
                            break;
                        case "3":
                        case "t":
                            rowValues.push(3);
                            break;
                        case "4":
                        case "N":
                            rowValues.push(4);
                            break;
                        case "5":
                        case "n":
                            rowValues.push(5);
                            break;
                        case "6":
                        case "G":
                            rowValues.push(6);
                            break;
                        case "7":
                        case "g":
                            rowValues.push(7);
                            break;
                        case "8":
                            rowValues.push(8);
                            break;
                        case "9":
                            rowValues.push(9);
                            break;
                        case "a":
                        case "A":
                        case "R":
                            rowValues.push(10);
                            break;
                        case "b":
                        case "B":
                        case "P":
                            rowValues.push(11);
                            break;
                        case "c":
                        case "C":
                        case "p":
                            rowValues.push(12);
                            break;
                        case "d":
                        case "D":
                        case "O":
                            rowValues.push(13);
                            break;
                        case "e":
                        case "E":
                        case "Y":
                            rowValues.push(14);
                            break;
                        case "f":
                        case "F":
                        case "W":
                            rowValues.push(15);
                            break;
                        default:
                            if (!/\s/.test(row[c]))
                                return undefined;
                    }
                }
                if (rowValues.length) {
                    sprite.push(rowValues);
                    spriteWidth = Math.max(spriteWidth, rowValues.length);
                }
            }
            const spriteHeight = sprite.length;
            const result = new Bitmap(spriteWidth, spriteHeight);
            for (let r = 0; r < spriteHeight; r++) {
                const row = sprite[r];
                for (let c = 0; c < spriteWidth; c++) {
                    if (c < row.length) {
                        result.set(c, r, row[c]);
                    }
                    else {
                        result.set(c, r, 0);
                    }
                }
            }
            return result;
        }
        sprite_1.imageLiteralToBitmap = imageLiteralToBitmap;
        function encodeAnimationString(frames, interval) {
            const encodedFrames = frames.map(frame => frame.data);
            const data = new Uint8ClampedArray(8 + encodedFrames[0].length * encodedFrames.length);
            // interval, frame width, frame height, frame count
            set16Bit(data, 0, interval);
            set16Bit(data, 2, frames[0].width);
            set16Bit(data, 4, frames[0].height);
            set16Bit(data, 6, frames.length);
            let offset = 8;
            encodedFrames.forEach(buf => {
                data.set(buf, offset);
                offset += buf.length;
            });
            return btoa(pxt.sprite.uint8ArrayToHex(data));
        }
        sprite_1.encodeAnimationString = encodeAnimationString;
        function addMissingTilemapTilesAndReferences(project, asset) {
            const allTiles = project.getProjectTiles(asset.data.tileset.tileWidth, true);
            asset.data.projectReferences = [];
            for (const tile of allTiles.tiles) {
                if (!asset.data.tileset.tiles.some(t => t.id === tile.id)) {
                    asset.data.tileset.tiles.push(tile);
                }
                if (project.isAssetUsed(tile, null, [asset.id])) {
                    asset.data.projectReferences.push(tile.id);
                }
            }
        }
        sprite_1.addMissingTilemapTilesAndReferences = addMissingTilemapTilesAndReferences;
        function updateTilemapReferencesFromResult(project, assetResult) {
            const result = assetResult.data;
            if (result.deletedTiles) {
                for (const deleted of result.deletedTiles) {
                    project.deleteTile(deleted);
                }
            }
            if (result.editedTiles) {
                for (const edit of result.editedTiles) {
                    const editedIndex = result.tileset.tiles.findIndex(t => t.id === edit);
                    const edited = result.tileset.tiles[editedIndex];
                    if (!edited)
                        continue;
                    result.tileset.tiles[editedIndex] = project.updateTile(edited);
                }
            }
            for (let i = 0; i < result.tileset.tiles.length; i++) {
                const tile = result.tileset.tiles[i];
                if (!tile.jresData) {
                    result.tileset.tiles[i] = project.resolveTile(tile.id);
                }
            }
            pxt.sprite.trimTilemapTileset(result);
        }
        sprite_1.updateTilemapReferencesFromResult = updateTilemapReferencesFromResult;
        function imageLiteralPrologue(fileType) {
            let res = '';
            switch (fileType) {
                case "python":
                    res = "img(\"\"\"";
                    break;
                default:
                    res = "img`";
                    break;
            }
            return res;
        }
        function imageLiteralEpilogue(fileType) {
            let res = '';
            switch (fileType) {
                case "python":
                    res += "\"\"\")";
                    break;
                default:
                    res += "`";
                    break;
            }
            return res;
        }
        function imageLiteralFromDimensions(width, height, color, fileType) {
            let res = imageLiteralPrologue(fileType);
            const paddingBetweenPixels = (width * height > 300) ? "" : " ";
            for (let r = 0; r < height; r++) {
                res += "\n";
                for (let c = 0; c < width; c++) {
                    res += hexChars[color] + paddingBetweenPixels;
                }
            }
            res += "\n";
            res += imageLiteralEpilogue(fileType);
            return res;
        }
        sprite_1.imageLiteralFromDimensions = imageLiteralFromDimensions;
        function bitmapToImageLiteral(bitmap, fileType) {
            if (!bitmap || bitmap.height === 0 || bitmap.width === 0)
                return "";
            let res = imageLiteralPrologue(fileType);
            if (bitmap) {
                const paddingBetweenPixels = (bitmap.width * bitmap.height > 300) ? "" : " ";
                for (let r = 0; r < bitmap.height; r++) {
                    res += "\n";
                    for (let c = 0; c < bitmap.width; c++) {
                        res += hexChars[bitmap.get(c, r)] + paddingBetweenPixels;
                    }
                }
            }
            res += "\n";
            res += imageLiteralEpilogue(fileType);
            return res;
        }
        sprite_1.bitmapToImageLiteral = bitmapToImageLiteral;
        function bitmapEquals(a, b) {
            return pxt.sprite.Bitmap.fromData(a).equals(pxt.sprite.Bitmap.fromData(b));
        }
        sprite_1.bitmapEquals = bitmapEquals;
        function tileWidthToTileScale(tileWidth) {
            switch (tileWidth) {
                case 8: return `TileScale.Eight`;
                case 16: return `TileScale.Sixteen`;
                case 32: return `TileScale.ThirtyTwo`;
                default: return Math.floor(Math.log2(tileWidth)).toString();
            }
        }
        sprite_1.tileWidthToTileScale = tileWidthToTileScale;
        function tileScaleToTileWidth(tileScale) {
            tileScale = tileScale.replace(/\s/g, "");
            switch (tileScale) {
                case `TileScale.Eight`: return 8;
                case `TileScale.Sixteen`: return 16;
                case `TileScale.ThirtyTwo`: return 32;
                default: return Math.pow(2, parseInt(tileScale));
            }
        }
        sprite_1.tileScaleToTileWidth = tileScaleToTileWidth;
        function hexToUint8Array(hex) {
            let r = new Uint8ClampedArray(hex.length >> 1);
            for (let i = 0; i < hex.length; i += 2)
                r[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
            return r;
        }
        sprite_1.hexToUint8Array = hexToUint8Array;
        function uint8ArrayToHex(data) {
            const hex = "0123456789abcdef";
            let res = "";
            for (let i = 0; i < data.length; ++i) {
                res += hex[data[i] >> 4];
                res += hex[data[i] & 0xf];
            }
            return res;
        }
        sprite_1.uint8ArrayToHex = uint8ArrayToHex;
        function set16Bit(buf, offset, value) {
            buf[offset] = value & 0xff;
            buf[offset + 1] = (value >> 8) & 0xff;
        }
        function colorStringToRGB(color) {
            const parsed = parseColorString(color);
            return [_r(parsed), _g(parsed), _b(parsed)];
        }
        function parseColorString(color) {
            if (color) {
                if (color.length === 6) {
                    return parseInt("0x" + color);
                }
                else if (color.length === 7) {
                    return parseInt("0x" + color.substr(1));
                }
            }
            return 0;
        }
        function _r(color) { return (color >> 16) & 0xff; }
        function _g(color) { return (color >> 8) & 0xff; }
        function _b(color) { return color & 0xff; }
        function toHex(bytes) {
            let r = "";
            for (let i = 0; i < bytes.length; ++i)
                r += ("0" + bytes[i].toString(16)).slice(-2);
            return r;
        }
    })(sprite = pxt.sprite || (pxt.sprite = {}));
})(pxt || (pxt = {}));
/// <reference path="./spriteutils.ts" />
var pxt;
(function (pxt) {
    var sprite;
    (function (sprite) {
        var legacy;
        (function (legacy) {
            const tileReferenceRegex = new RegExp(`^\\s*${sprite.TILE_NAMESPACE}\\s*\\.\\s*${sprite.TILE_PREFIX}(\\d+)\\s*$`);
            class LegacyTilemapData {
                constructor(tilemap, tileset, layers) {
                    this.tilemap = tilemap;
                    this.tileset = tileset;
                    this.layers = layers;
                    this.nextId = 0;
                }
            }
            legacy.LegacyTilemapData = LegacyTilemapData;
            function decodeTilemap(literal, fileType) {
                var _a;
                literal = (_a = pxt.Util.htmlUnescape(literal)) === null || _a === void 0 ? void 0 : _a.trim();
                if (!(literal === null || literal === void 0 ? void 0 : literal.trim())) {
                    return new LegacyTilemapData(new sprite.Tilemap(16, 16), { tileWidth: 16, tiles: [] }, new sprite.Bitmap(16, 16).data());
                }
                literal = literal.substr(literal.indexOf("(") + 1);
                literal = literal.substr(0, literal.lastIndexOf(")"));
                const tm = literal.substr(0, literal.indexOf(","));
                literal = literal.substr(tm.length + 1);
                const layer = literal.substr(0, literal.indexOf(","));
                literal = literal.substr(layer.length + 1);
                const tileset = literal.substr(0, literal.lastIndexOf("]") + 1);
                literal = literal.substr(tileset.length + 1);
                const tilescale = literal;
                const result = new LegacyTilemapData(sprite.tilemapLiteralToTilemap(tm), {
                    tiles: decodeTileset(tileset),
                    tileWidth: sprite.tileScaleToTileWidth(tilescale)
                }, sprite.imageLiteralToBitmap(layer).data());
                return result;
            }
            legacy.decodeTilemap = decodeTilemap;
            function decodeTileset(tileset) {
                tileset = tileset.replace(/[\[\]]/g, "");
                return tileset ? tileset.split(",").filter(t => !!t.trim()).map(t => decodeTile(t)) : [];
            }
            function decodeTile(literal) {
                literal = literal.trim();
                if (literal.indexOf("img") === 0) {
                    const bitmap = sprite.imageLiteralToBitmap(literal);
                    return {
                        data: bitmap.data()
                    };
                }
                const match = tileReferenceRegex.exec(literal);
                if (match) {
                    return {
                        data: null,
                        projectId: Number(match[1])
                    };
                }
                return {
                    data: null,
                    qualifiedName: literal
                };
            }
            function tileToBlocklyVariable(info) {
                return `${info.projectId};${info.data.width};${info.data.height};${pxtc.Util.toHex(info.data.data)}`;
            }
            legacy.tileToBlocklyVariable = tileToBlocklyVariable;
            function blocklyVariableToTile(name) {
                const parts = name.split(";");
                if (parts.length !== 4) {
                    return null;
                }
                return {
                    projectId: parseInt(parts[0]),
                    data: {
                        width: parseInt(parts[1]),
                        height: parseInt(parts[2]),
                        data: new Uint8ClampedArray(pxtc.Util.fromHex(parts[3])),
                        x0: 0,
                        y0: 0
                    }
                };
            }
            legacy.blocklyVariableToTile = blocklyVariableToTile;
        })(legacy = sprite.legacy || (sprite.legacy = {}));
    })(sprite = pxt.sprite || (pxt.sprite = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var storage;
    (function (storage) {
        class MemoryStorage {
            constructor() {
                this.items = {};
            }
            removeItem(key) {
                delete this.items[key];
            }
            getItem(key) {
                return this.items[key];
            }
            setItem(key, value) {
                this.items[key] = value;
            }
            clear() {
                this.items = {};
            }
        }
        class LocalStorage {
            constructor(storageId) {
                this.storageId = storageId;
            }
            targetKey(key) {
                return this.storageId + '/' + key;
            }
            removeItem(key) {
                window.localStorage.removeItem(this.targetKey(key));
            }
            getItem(key) {
                return window.localStorage[this.targetKey(key)];
            }
            setItem(key, value) {
                window.localStorage[this.targetKey(key)] = value;
            }
            clear() {
                let prefix = this.targetKey('');
                let keys = [];
                for (let i = 0; i < window.localStorage.length; ++i) {
                    let key = window.localStorage.key(i);
                    if (key.indexOf(prefix) == 0)
                        keys.push(key);
                }
                keys.forEach(key => window.localStorage.removeItem(key));
            }
        }
        function storageId() {
            if (pxt.appTarget)
                return pxt.appTarget.id;
            const cfg = window.pxtConfig;
            if (cfg)
                return cfg.targetId;
            const bndl = window.pxtTargetBundle;
            if (bndl)
                return bndl.id;
            return '';
        }
        storage.storageId = storageId;
        let impl;
        function init() {
            if (impl)
                return;
            // test if local storage is supported
            const sid = storageId();
            let supported = false;
            // no local storage in sandbox mode
            if (!pxt.shell.isSandboxMode()) {
                try {
                    window.localStorage[sid] = '1';
                    let v = window.localStorage[sid];
                    supported = true;
                }
                catch (e) { }
            }
            if (!supported) {
                impl = new MemoryStorage();
                pxt.debug('storage: in memory');
            }
            else {
                impl = new LocalStorage(sid);
                pxt.debug(`storage: local under ${sid}`);
            }
        }
        function setLocal(key, value) {
            init();
            impl.setItem(key, value);
        }
        storage.setLocal = setLocal;
        function getLocal(key) {
            init();
            return impl.getItem(key);
        }
        storage.getLocal = getLocal;
        function removeLocal(key) {
            init();
            impl.removeItem(key);
        }
        storage.removeLocal = removeLocal;
        function clearLocal() {
            init();
            impl.clear();
        }
        storage.clearLocal = clearLocal;
    })(storage = pxt.storage || (pxt.storage = {}));
})(pxt || (pxt = {}));
/**
 * Storage that will be shared across localhost frames when developing locally. Uses regular browser storage in production.
 * One side effect: Localhost storage will be shared between different browsers and incognito tabs as well. To disable this
 * behavior, set the `routingEnabled` switch below to `false`.
 */
(function (pxt) {
    var storage;
    (function (storage) {
        var localhost;
        (function (localhost) {
            /**
             * Override switch. Setting this to `false` will stop routing calls to the pxt server, using browser storage instead.
             */
            const routingEnabled = true;
            // Specify host and port explicitly so that localhost frames not served on the default port (e.g. skillmap) can access it.
            const localhostStoreUrl = "http://localhost:3232/api/store/";
            async function getAsync(container, key) {
                if (routingEnabled && pxt.BrowserUtils.isLocalHostDev()) {
                    const resp = await pxt.Util.requestAsync({
                        url: `${localhostStoreUrl}${encodeURIComponent(container)}/${encodeURIComponent(key)}`,
                        method: "GET",
                        allowHttpErrors: true
                    });
                    if (resp.json) {
                        return resp.json;
                    }
                    else if (resp.text) {
                        return resp.text;
                    }
                    else {
                        return undefined;
                    }
                }
                else {
                    const sval = pxt.storage.getLocal(`${container}:${key}`);
                    const val = JSON.parse(sval);
                    return val;
                }
            }
            localhost.getAsync = getAsync;
            async function setAsync(container, key, val) {
                if (typeof val == "undefined") {
                    await pxt.storage.localhost.delAsync(container, key);
                    return;
                }
                let sval = "";
                if (typeof val === "object")
                    sval = JSON.stringify(val);
                else
                    sval = val.toString();
                if (routingEnabled && pxt.BrowserUtils.isLocalHostDev()) {
                    const data = {
                        type: (typeof val === "object") ? "json" : "text",
                        val: sval
                    };
                    const sdata = JSON.stringify(data);
                    await pxt.Util.requestAsync({
                        url: `${localhostStoreUrl}${encodeURIComponent(container)}/${encodeURIComponent(key)}`,
                        method: "POST",
                        data: sdata
                    });
                }
                else {
                    pxt.storage.setLocal(`${container}:${key}`, sval);
                }
            }
            localhost.setAsync = setAsync;
            async function delAsync(container, key) {
                if (routingEnabled && pxt.BrowserUtils.isLocalHostDev()) {
                    await pxt.Util.requestAsync({
                        url: `${localhostStoreUrl}${encodeURIComponent(container)}/${encodeURIComponent(key)}`,
                        method: "DELETE",
                        allowHttpErrors: true
                    });
                }
                else {
                    pxt.storage.removeLocal(`${container}:${key}`);
                }
            }
            localhost.delAsync = delAsync;
        })(localhost = storage.localhost || (storage.localhost = {}));
    })(storage = pxt.storage || (pxt.storage = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/pxtpackage.d.ts"/>
/// <reference path="../localtypings/pxtparts.d.ts"/>
/// <reference path="../localtypings/pxtarget.d.ts"/>
/// <reference path="util.ts"/>
var pxt;
(function (pxt) {
    const CONFIG_FIELDS_ORDER = [
        "name",
        "version",
        "description",
        "license",
        "dependencies",
        "files",
        "testFiles",
        "testDependencies",
        "fileDependencies",
        "public",
        "targetVersions",
        "supportedTargets",
        "preferredEditor",
        "languageRestriction",
        "additionalFilePath",
        "additionalFilePaths"
    ];
    class Package {
        constructor(id, _verspec, parent, addedBy) {
            this.id = id;
            this._verspec = _verspec;
            this.parent = parent;
            this.level = -1; // main package = 0, first children = 1, etc
            this.isLoaded = false;
            this.ignoreTests = false;
            this.cppOnly = false;
            if (addedBy) {
                this.level = addedBy.level + 1;
            }
            this.addedBy = [addedBy];
        }
        static stringifyConfig(config) {
            // reorg fields
            const configMap = config;
            const newCfg = {};
            for (const f of CONFIG_FIELDS_ORDER) {
                if (configMap.hasOwnProperty(f))
                    newCfg[f] = configMap[f];
            }
            for (const f of Object.keys(configMap)) {
                if (!newCfg.hasOwnProperty(f))
                    newCfg[f] = configMap[f];
            }
            // github adds a newline when web editing
            return JSON.stringify(newCfg, null, 4) + "\n";
        }
        static parseAndValidConfig(configStr) {
            const json = pxt.Util.jsonTryParse(configStr);
            return json
                && json.name !== undefined && typeof json.name === "string"
                // && json.version && typeof json.version === "string", default to 0.0.0
                && json.files && Array.isArray(json.files) && json.files.every(f => typeof f === "string")
                && json.dependencies && Object.keys(json.dependencies).every(k => typeof json.dependencies[k] === "string")
                && json;
        }
        static getConfigAsync(pkgTargetVersion, id, fullVers) {
            return Promise.resolve().then(() => {
                if (pxt.github.isGithubId(fullVers)) {
                    const repoInfo = pxt.github.parseRepoId(fullVers);
                    return pxt.packagesConfigAsync()
                        .then(config => pxt.github.repoAsync(repoInfo.fullName, config)) // Make sure repo exists and is whitelisted
                        .then(gitRepo => gitRepo ? pxt.github.pkgConfigAsync(repoInfo.fullName, repoInfo.tag) : null);
                }
                else {
                    // If it's not from GH, assume it's a bundled package
                    // TODO: Add logic for shared packages if we enable that
                    const updatedRef = pxt.patching.upgradePackageReference(pkgTargetVersion, id, fullVers);
                    const bundledPkg = pxt.appTarget.bundledpkgs[updatedRef];
                    return JSON.parse(bundledPkg[pxt.CONFIG_NAME]);
                }
            });
        }
        static corePackages() {
            const pkgs = pxt.appTarget.bundledpkgs;
            return Object.keys(pkgs).map(id => JSON.parse(pkgs[id][pxt.CONFIG_NAME]))
                .filter(cfg => !!cfg);
        }
        disablesVariant(v) {
            return this.config && this.config.disablesVariants && this.config.disablesVariants.indexOf(v) >= 0;
        }
        invalid() {
            return /^invalid:/.test(this.version());
        }
        version() {
            return this.resolvedVersion || this._verspec;
        }
        verProtocol() {
            let spl = this.version().split(':');
            if (spl.length > 1)
                return spl[0];
            else
                return "";
        }
        verArgument() {
            let p = this.verProtocol();
            if (p)
                return this.version().slice(p.length + 1);
            return this.version();
        }
        targetVersion() {
            return (this.parent && this.parent != this)
                ? this.parent.targetVersion()
                : this.config.targetVersions
                    ? this.config.targetVersions.target
                    : undefined;
        }
        commonDownloadAsync() {
            const proto = this.verProtocol();
            if (proto == "pub") {
                return pxt.Cloud.downloadScriptFilesAsync(this.verArgument());
            }
            else if (proto == "github") {
                return pxt.packagesConfigAsync()
                    .then(config => pxt.github.downloadPackageAsync(this.verArgument(), config))
                    .then(resp => resp.files);
            }
            else if (proto == "embed") {
                const resp = pxt.getEmbeddedScript(this.verArgument());
                return Promise.resolve(resp);
            }
            else if (proto == "pkg") {
                // the package source is serialized in a file in the package itself
                const src = this.parent || this; // fall back to current package if no parent
                const pkgFilesSrc = src.readFile(this.verArgument());
                const pkgFilesJson = ts.pxtc.Util.jsonTryParse(pkgFilesSrc);
                if (!pkgFilesJson)
                    pxt.log(`unable to find ${this.verArgument()}`);
                return Promise.resolve(pkgFilesJson);
            }
            else
                return Promise.resolve(null);
        }
        host() { return this.parent._host; }
        readFile(fn) {
            return this.host().readFile(this, fn);
        }
        readGitJson() {
            const gitJsonText = this.readFile(pxt.github.GIT_JSON);
            return pxt.Util.jsonTryParse(gitJsonText);
        }
        resolveDep(id) {
            if (this.parent.deps.hasOwnProperty(id))
                return this.parent.deps[id];
            return null;
        }
        saveConfig() {
            const cfg = pxt.U.clone(this.config);
            delete cfg.additionalFilePaths;
            const text = pxt.Package.stringifyConfig(cfg);
            this.host().writeFile(this, pxt.CONFIG_NAME, text);
        }
        setPreferredEditor(editor) {
            if (this.config.preferredEditor != editor) {
                this.config.preferredEditor = editor;
                this.saveConfig();
            }
        }
        getPreferredEditor() {
            let editor = this.config.preferredEditor;
            if (!editor) {
                // older editors do not have this field set so we need to apply our
                // language resolution logic here
                // note that the preferredEditor field will be set automatically on the first save
                // 1. no main.blocks in project, open javascript
                const hasMainBlocks = this.getFiles().indexOf(pxt.MAIN_BLOCKS) >= 0;
                if (!hasMainBlocks)
                    return pxt.JAVASCRIPT_PROJECT_NAME;
                // 2. if main.blocks is empty and main.ts is non-empty
                //    open typescript
                // https://github.com/microsoft/pxt/blob/master/webapp/src/app.tsx#L1032
                const mainBlocks = this.readFile(pxt.MAIN_BLOCKS);
                const mainTs = this.readFile(pxt.MAIN_TS);
                if (!mainBlocks && mainTs)
                    return pxt.JAVASCRIPT_PROJECT_NAME;
                // 3. default ot blocks
                return pxt.BLOCKS_PROJECT_NAME;
            }
            return editor;
        }
        parseJRes(allres = {}) {
            for (const f of this.getFiles()) {
                if (pxt.U.endsWith(f, ".jres")) {
                    inflateJRes(JSON.parse(this.readFile(f)), allres);
                }
            }
            return allres;
        }
        resolveVersionAsync() {
            var _a;
            let v = this._verspec;
            if (pxt.getEmbeddedScript(this.id)) {
                this.resolvedVersion = v = "embed:" + this.id;
            }
            else if (!v || v == "*") {
                // don't hard crash, instead ignore dependency
                // U.userError(lf("version not specified for {0}", this.id))
                this.configureAsInvalidPackage(lf("version not specified for {0}", this.id));
                v = this._verspec;
            }
            // patch github version numbers
            else if (this.verProtocol() == "github") {
                const ghid = pxt.github.parseRepoId(this._verspec);
                if (ghid && !ghid.tag && this.parent) {
                    // we have a valid repo but no tag
                    pxt.debug(`dep: unbound github extensions, trying to resolve tag`);
                    // check if we've already loaded this slug in the project, in which case we use that version number
                    const others = pxt.semver.sortLatestTags(pxt.Util.values(((_a = this.parent) === null || _a === void 0 ? void 0 : _a.deps) || {})
                        .map(dep => pxt.github.parseRepoId(dep.version()))
                        .filter(v => (v === null || v === void 0 ? void 0 : v.slug) === ghid.slug)
                        .map(v => v.tag));
                    const best = others[0];
                    if (best) {
                        ghid.tag = best;
                        this.resolvedVersion = v = pxt.github.stringifyRepo(ghid);
                        pxt.debug(`dep: github patched ${this._verspec} to ${v}`);
                    }
                }
            }
            return Promise.resolve(v);
        }
        downloadAsync() {
            return this.resolveVersionAsync()
                .then(verNo => {
                if (this.invalid()) {
                    pxt.debug(`skip download of invalid package ${this.id}`);
                    return undefined;
                }
                if (!/^embed:/.test(verNo) && this.installedVersion == verNo)
                    return undefined;
                pxt.debug('downloading ' + verNo);
                return this.host().downloadPackageAsync(this)
                    .then(() => {
                    this.loadConfig();
                    pxt.debug(`installed ${this.id} /${verNo}`);
                });
            });
        }
        loadConfig() {
            if (this.level != 0 && this.invalid())
                return; // don't try load invalid dependency
            const confStr = this.readFile(pxt.CONFIG_NAME);
            if (!confStr)
                pxt.U.userError(`extension ${this.id} is missing ${pxt.CONFIG_NAME}`);
            this.parseConfig(confStr);
            if (this.level != 0)
                this.installedVersion = this.version();
            this.saveConfig();
        }
        validateConfig() {
            if (!this.config.dependencies)
                pxt.U.userError("Missing dependencies in config of: " + this.id);
            if (!Array.isArray(this.config.files))
                pxt.U.userError("Missing files in config of: " + this.id);
            if (typeof this.config.name != "string" || !this.config.name)
                this.config.name = lf("Untitled");
            // don't be so uptight about project names,
            // handle invalid names downstream
            if (this.config.targetVersions
                && this.config.targetVersions.target
                && this.config.targetVersions.targetId === pxt.appTarget.id // make sure it's the same target
                && pxt.appTarget.versions
                && pxt.semver.majorCmp(this.config.targetVersions.target, pxt.appTarget.versions.target) > 0)
                pxt.U.userError(lf("{0} requires target version {1} (you are running {2})", this.config.name, this.config.targetVersions.target, pxt.appTarget.versions.target));
        }
        isPackageInUse(pkgId, ts = this.readFile(pxt.MAIN_TS)) {
            // Build the RegExp that will determine whether the dependency is in use. Try to use upgrade rules,
            // otherwise fallback to the package's name
            let regex = null;
            const upgrades = pxt.patching.computePatches(this.targetVersion(), "missingPackage");
            if (upgrades) {
                upgrades.forEach((rule) => {
                    Object.keys(rule.map).forEach((match) => {
                        if (rule.map[match] === pkgId) {
                            regex = new RegExp(match, "g");
                        }
                    });
                });
            }
            if (!regex) {
                regex = new RegExp(pkgId + "\\.", "g");
            }
            return regex.test(ts);
        }
        upgradePackagesAsync() {
            if (!this.config)
                this.loadConfig();
            return pxt.packagesConfigAsync()
                .then(packagesConfig => {
                let numfixes = 0;
                let fixes = {};
                pxt.U.iterMap(this.config.dependencies, (pkg, ver) => {
                    if (pxt.github.isGithubId(ver)) {
                        const upgraded = pxt.github.upgradedPackageReference(packagesConfig, ver);
                        if (upgraded && upgraded != ver) {
                            pxt.log(`upgrading dep ${pkg}: ${ver} -> ${upgraded}`);
                            fixes[ver] = upgraded;
                            this.config.dependencies[pkg] = upgraded;
                            numfixes++;
                        }
                    }
                });
                if (numfixes)
                    this.saveConfig();
                return numfixes && fixes;
            });
        }
        getMissingPackages(config, ts) {
            const upgrades = pxt.patching.computePatches(this.targetVersion(), "missingPackage");
            const missing = {};
            if (ts && upgrades)
                upgrades.forEach(rule => {
                    Object.keys(rule.map).forEach(match => {
                        const regex = new RegExp(match, 'g');
                        const pkg = rule.map[match];
                        ts.replace(regex, (m) => {
                            if (!config.dependencies[pkg]) {
                                missing[pkg] = "*";
                            }
                            return "";
                        });
                    });
                });
            return missing;
        }
        /**
         * For the given package config or ID, looks through all the currently installed packages to find conflicts in
         * Yotta settings and version spec
         */
        findConflictsAsync(pkgOrId, version) {
            let conflicts = [];
            let pkgCfg;
            return Promise.resolve()
                .then(() => {
                // Get the package config if it's not already provided
                if (typeof pkgOrId === "string") {
                    return Package.getConfigAsync(this.targetVersion(), pkgOrId, version);
                }
                else {
                    return Promise.resolve(pkgOrId);
                }
            })
                .then((cfg) => {
                pkgCfg = cfg;
                // Iterate through all installed packages and check for conflicting settings
                if (pkgCfg) {
                    const yottaCfg = pkgCfg.yotta ? pxt.U.jsonFlatten(pkgCfg.yotta.config) : null;
                    this.parent.sortedDeps().forEach((depPkg) => {
                        if (pkgCfg.core && depPkg.config.core &&
                            pkgCfg.name != depPkg.config.name) {
                            const conflict = new pxt.cpp.PkgConflictError(lf("conflict between core extensions {0} and {1}", pkgCfg.name, depPkg.id));
                            conflict.pkg0 = depPkg;
                            conflicts.push(conflict);
                            return;
                        }
                        let foundYottaConflict = false;
                        if (yottaCfg) {
                            const depConfig = depPkg.config || JSON.parse(depPkg.readFile(pxt.CONFIG_NAME));
                            const hasYottaSettings = !!depConfig && !!depConfig.yotta && !!depPkg.config.yotta.config;
                            if (hasYottaSettings) {
                                const depYottaCfg = pxt.U.jsonFlatten(depConfig.yotta.config);
                                for (const settingName of Object.keys(yottaCfg)) {
                                    const depSetting = depYottaCfg[settingName];
                                    const isJustDefaults = pkgCfg.yotta.configIsJustDefaults || depConfig.yotta.configIsJustDefaults;
                                    if (depYottaCfg.hasOwnProperty(settingName) && depSetting !== yottaCfg[settingName] && !isJustDefaults && (!depPkg.parent.config.yotta || !depPkg.parent.config.yotta.ignoreConflicts)) {
                                        const conflict = new pxt.cpp.PkgConflictError(lf("conflict on yotta setting {0} between extensions {1} and {2}", settingName, pkgCfg.name, depPkg.id));
                                        conflict.pkg0 = depPkg;
                                        conflict.settingName = settingName;
                                        conflicts.push(conflict);
                                        foundYottaConflict = true;
                                    }
                                }
                            }
                        }
                        if (!foundYottaConflict
                            && pkgCfg.name === depPkg.id
                            && depPkg._verspec !== version
                            && !/^file:/.test(depPkg._verspec)
                            && !/^file:/.test(version)) {
                            // we have a potential version mistmatch here
                            // check if versions are semver compatible for github refs
                            const ghCurrent = /^github:/.test(depPkg._verspec)
                                && pxt.github.parseRepoId(depPkg._verspec);
                            const ghNew = /^github:/.test(version)
                                && pxt.github.parseRepoId(version);
                            if (!ghCurrent || !ghNew // only for github refs
                                || ghCurrent.fullName !== ghNew.fullName // must be same extension
                                // if newversion does not have tag, it's ok
                                // note: we are upgrade major versions as well
                                || (ghNew.tag && pxt.semver.strcmp(ghCurrent.tag, ghNew.tag) < 0)) {
                                const conflict = new pxt.cpp.PkgConflictError(lf("version mismatch for extension {0} (installed: {1}, installing: {2})", depPkg.id, depPkg._verspec, version));
                                conflict.pkg0 = depPkg;
                                conflict.isVersionConflict = true;
                                conflicts.push(conflict);
                            }
                        }
                    });
                }
                // Also check for conflicts for all the specified package's dependencies (recursively)
                return Object.keys(pkgCfg.dependencies).reduce((soFar, pkgDep) => {
                    return soFar
                        .then(() => this.findConflictsAsync(pkgDep, pkgCfg.dependencies[pkgDep]))
                        .then((childConflicts) => conflicts.push.apply(conflicts, childConflicts));
                }, Promise.resolve());
            })
                .then(() => {
                // For each conflicting package, we need to include their ancestor tree in the list of conflicts
                // For example, if package A depends on package B, and package B is in conflict with package C,
                // then package A is also technically in conflict with C
                const allAncestors = (p) => {
                    const ancestors = [];
                    p.addedBy.forEach((a) => {
                        if (a.id !== this.id) {
                            ancestors.push.apply(allAncestors(a));
                            ancestors.push(a);
                        }
                    });
                    return ancestors;
                };
                const additionalConflicts = [];
                conflicts.forEach((c) => {
                    additionalConflicts.push.apply(additionalConflicts, allAncestors(c.pkg0).map((anc) => {
                        const confl = new pxt.cpp.PkgConflictError(c.isVersionConflict ?
                            lf("a dependency of {0} has a version mismatch with extension {1} (installed: {1}, installing: {2})", anc.id, pkgCfg.name, c.pkg0._verspec, version) :
                            lf("conflict on yotta setting {0} between extensions {1} and {2}", c.settingName, pkgCfg.name, c.pkg0.id));
                        confl.pkg0 = anc;
                        return confl;
                    }));
                });
                conflicts.push.apply(conflicts, additionalConflicts);
                // Remove duplicate conflicts (happens if more than one package had the same ancestor)
                conflicts = conflicts.filter((c, index) => {
                    for (let i = 0; i < index; ++i) {
                        if (c.pkg0.id === conflicts[i].pkg0.id) {
                            return false;
                        }
                    }
                    return true;
                });
                return conflicts;
            });
        }
        configureAsInvalidPackage(reason) {
            pxt.log(`invalid package ${this.id}: ${reason}`);
            this._verspec = "invalid:" + this.id;
            this.config = {
                name: this.id,
                description: reason,
                dependencies: {},
                files: []
            };
        }
        parseConfig(cfgSrc, targetVersion) {
            try {
                const cfg = JSON.parse(cfgSrc);
                this.config = cfg;
            }
            catch (e) {
                this.configureAsInvalidPackage(lf("Syntax error in pxt.json"));
                pxt.tickEvent("package.invalidConfigEncountered");
            }
            const currentConfig = JSON.stringify(this.config);
            for (const dep in this.config.dependencies) {
                const value = pxt.patching.upgradePackageReference(this.targetVersion(), dep, this.config.dependencies[dep]);
                if (value != dep) {
                    delete this.config.dependencies[dep];
                    if (value) {
                        this.config.dependencies[value] = "*";
                    }
                }
            }
            if (targetVersion) {
                this.config.targetVersions = {
                    target: targetVersion
                };
            }
            if (JSON.stringify(this.config) != currentConfig) {
                this.saveConfig();
            }
            this.validateConfig();
        }
        patchCorePackage() {
            pxt.Util.assert(pxt.appTarget.simulator && pxt.appTarget.simulator.dynamicBoardDefinition);
            pxt.Util.assert(this.level == 0);
            // find all core packages in target
            const corePackages = Object.keys(this.config.dependencies)
                .filter(dep => !!dep && (dep == pxt.BLOCKS_PROJECT_NAME || dep == pxt.JAVASCRIPT_PROJECT_NAME ||
                JSON.parse((pxt.appTarget.bundledpkgs[dep] || {})[pxt.CONFIG_NAME] || "{}").core));
            // no core package? add the first one
            if (corePackages.length == 0) {
                const allCorePkgs = pxt.Package.corePackages();
                /* eslint-disable @typescript-eslint/no-unused-expressions */
                if (allCorePkgs.length)
                    this.config.dependencies[allCorePkgs[0].name];
                /* eslint-enable @typescript-eslint/no-unused-expressions */
            }
            else if (corePackages.length > 1) {
                // keep last package
                corePackages.pop();
                corePackages.forEach(dep => {
                    pxt.log(`removing core package ${dep}`);
                    delete this.config.dependencies[dep];
                });
            }
        }
        resolvedDependencies() {
            return Object.keys(this.dependencies()).map(n => this.resolveDep(n));
        }
        dependencies(includeCpp = false) {
            if (!this.config)
                return {};
            const dependencies = pxt.Util.clone(this.config.dependencies || {});
            // add test dependencies if nedeed
            if (this.level == 0 && this.config.testDependencies) {
                // only add testDepdencies that can be resolved
                pxt.Util.iterMap(this.config.testDependencies, (k, v) => {
                    if (v != "*" || pxt.appTarget.bundledpkgs[k])
                        dependencies[k] = v;
                });
            }
            if (includeCpp && this.config.cppDependencies) {
                pxt.Util.jsonMergeFrom(dependencies, this.config.cppDependencies);
            }
            return dependencies;
        }
        loadAsync(isInstall = false, targetVersion) {
            if (this.isLoaded)
                return Promise.resolve();
            let initPromise = Promise.resolve();
            if (this.level == 0 && !pxt.appTarget.multiVariants)
                pxt.setAppTargetVariant(null);
            this.isLoaded = true;
            const str = this.readFile(pxt.CONFIG_NAME);
            if (str == null) {
                if (!isInstall)
                    pxt.U.userError("Package not installed: " + this.id + ", did you forget to run `pxt install`?");
            }
            else {
                initPromise = initPromise.then(() => this.parseConfig(str));
            }
            // if we are installing this script, we haven't yet downloaded the config
            // do upgrade later
            if (this.level == 0 && !isInstall) {
                initPromise = initPromise.then(() => this.upgradePackagesAsync().then(() => { }));
            }
            if (isInstall)
                initPromise = initPromise.then(() => this.downloadAsync());
            // we are installing the script, and we've download the original version and we haven't upgraded it yet
            // do upgrade and reload as needed
            if (this.level == 0 && isInstall) {
                initPromise = initPromise.then(() => this.upgradePackagesAsync())
                    .then(fixes => {
                    if (fixes) {
                        // worst case scenario with double load
                        Object.keys(fixes).forEach(key => pxt.tickEvent("package.doubleload", { "extension": key }));
                        pxt.log(`upgraded, downloading again`);
                        pxt.debug(fixes);
                        return this.downloadAsync();
                    }
                    // nothing to do here
                    else
                        return Promise.resolve();
                });
            }
            if (pxt.appTarget.simulator && pxt.appTarget.simulator.dynamicBoardDefinition) {
                if (this.level == 0)
                    initPromise = initPromise.then(() => this.patchCorePackage());
                initPromise = initPromise.then(() => {
                    if (this.config.compileServiceVariant)
                        pxt.setAppTargetVariant(this.config.compileServiceVariant);
                    if (this.config.files.indexOf("board.json") < 0)
                        return;
                    const def = pxt.appTarget.simulator.boardDefinition = JSON.parse(this.readFile("board.json"));
                    def.id = this.config.name;
                    pxt.appTarget.appTheme.boardName = def.boardName || lf("board");
                    pxt.appTarget.appTheme.driveDisplayName = def.driveDisplayName || lf("DRIVE");
                    let expandPkg = (v) => {
                        let m = /^pkg:\/\/(.*)/.exec(v);
                        if (m) {
                            let fn = m[1];
                            let content = this.readFile(fn);
                            return pxt.U.toDataUri(content, pxt.U.getMime(fn));
                        }
                        else {
                            return v;
                        }
                    };
                    let bd = pxt.appTarget.simulator.boardDefinition;
                    if (typeof bd.visual == "object") {
                        let vis = bd.visual;
                        vis.image = expandPkg(vis.image);
                        vis.outlineImage = expandPkg(vis.outlineImage);
                    }
                });
            }
            const handleVerMismatch = (mod, ver) => {
                var _a;
                pxt.debug(`version spec mismatch: ${mod._verspec} != ${ver}`);
                // if both are github, try to pick the higher semver
                if (/^github:/.test(mod._verspec) && /^github:/.test(ver)) {
                    const modid = pxt.github.parseRepoId(mod._verspec);
                    const verid = pxt.github.parseRepoId(ver);
                    // same repo
                    if ((modid === null || modid === void 0 ? void 0 : modid.slug) && (modid === null || modid === void 0 ? void 0 : modid.slug) === (verid === null || verid === void 0 ? void 0 : verid.slug)) {
                        // if modid does not have a tag, try sniffing it from config
                        // this may be an issue if the user does not create releases
                        // and pulls from master
                        const modtag = (modid === null || modid === void 0 ? void 0 : modid.tag) || ((_a = mod.config) === null || _a === void 0 ? void 0 : _a.version);
                        const c = pxt.semver.strcmp(modtag, verid.tag);
                        if (c == 0) {
                            // turns out to be the same versions
                            pxt.debug(`resolved version are ${modtag}`);
                            return;
                        }
                        else if (c < 0) {
                            // already loaded version of dependencies is greater
                            // than current version, use it instead
                            pxt.debug(`auto-upgraded ${ver} to ${modtag}`);
                            return;
                        }
                    }
                }
                // ignore, file: protocol
                if (/^file:/.test(mod._verspec) || /^file:/.test(ver)) {
                    pxt.debug(`ignore file: mismatch issues`);
                    return;
                }
                // crashing if really really not good
                // so instead we just ignore and continute
                mod.configureAsInvalidPackage(lf("version mismatch"));
            };
            const loadDepsRecursive = async (deps, from, isCpp = false) => {
                if (!deps)
                    deps = from.dependencies(isCpp);
                pxt.debug(`deps: ${from.id}->${Object.keys(deps).join(", ")}`);
                deps = pxt.github.resolveMonoRepoVersions(deps);
                pxt.debug(`deps: resolved ${from.id}->${Object.keys(deps).join(", ")}`);
                for (let id of Object.keys(deps)) {
                    let ver = deps[id] || "*";
                    pxt.debug(`dep: load ${from.id}.${id}${isCpp ? "++" : ""}: ${ver}`);
                    if (id == "hw" && pxt.hwVariant)
                        id = "hw---" + pxt.hwVariant;
                    let mod = from.resolveDep(id);
                    if (mod) {
                        // check if the current dependecy matches the ones
                        // loaded in parent
                        if (!mod.invalid() && mod._verspec !== ver)
                            handleVerMismatch(mod, ver);
                        // bail out if invalid
                        if (mod.invalid()) {
                            // failed to resolve dependency, ignore
                            mod.level = Math.min(mod.level, from.level + 1);
                            mod.addedBy.push(from);
                            continue;
                        }
                        if (!isCpp) {
                            mod.level = Math.min(mod.level, from.level + 1);
                            mod.addedBy.push(from);
                        }
                    }
                    else {
                        let mod = new Package(id, ver, from.parent, from);
                        if (isCpp)
                            mod.cppOnly = true;
                        from.parent.deps[id] = mod;
                        // we can have "core---nrf52" to be used instead of "core" in other packages
                        from.parent.deps[id.replace(/---.*/, "")] = mod;
                        await mod.loadAsync(isInstall);
                    }
                }
            };
            return initPromise
                .then(() => loadDepsRecursive(null, this))
                .then(() => {
                // get paletter config loading deps, so the more higher level packages take precedence
                if (this.config.palette && pxt.appTarget.runtime) {
                    pxt.appTarget.runtime.palette = pxt.U.clone(this.config.palette);
                    if (this.config.paletteNames)
                        pxt.appTarget.runtime.paletteNames = this.config.paletteNames;
                }
                // get screen size loading deps, so the more higher level packages take precedence
                if (this.config.screenSize && pxt.appTarget.runtime)
                    pxt.appTarget.runtime.screenSize = pxt.U.clone(this.config.screenSize);
                if (this.level === 0) {
                    // Check for missing packages. We need to add them 1 by 1 in case they conflict with eachother.
                    const mainTs = this.readFile(pxt.MAIN_TS);
                    if (!mainTs)
                        return Promise.resolve(null);
                    const missingPackages = this.getMissingPackages(this.config, mainTs);
                    let didAddPackages = false;
                    return Object.keys(missingPackages).reduce((addPackagesPromise, missing) => {
                        return addPackagesPromise
                            .then(() => this.findConflictsAsync(missing, missingPackages[missing]))
                            .then((conflicts) => {
                            if (conflicts.length) {
                                const conflictNames = conflicts.map((c) => c.pkg0.id).join(", ");
                                const settingNames = conflicts.map((c) => c.settingName).filter((s) => !!s).join(", ");
                                pxt.log(`skipping missing package ${missing} because it conflicts with the following packages: ${conflictNames} (conflicting settings: ${settingNames})`);
                                return Promise.resolve(null);
                            }
                            else {
                                pxt.log(`adding missing package ${missing}`);
                                didAddPackages = true;
                                this.config.dependencies[missing] = "*";
                                const addDependency = {};
                                addDependency[missing] = missingPackages[missing];
                                return loadDepsRecursive(addDependency, this);
                            }
                        });
                    }, Promise.resolve(null))
                        .then(() => {
                        if (didAddPackages) {
                            this.saveConfig();
                            this.validateConfig();
                        }
                        return Promise.resolve(null);
                    });
                }
                return Promise.resolve(null);
            })
                .then(() => {
                if (this.level != 0)
                    return Promise.resolve();
                return Promise.all(pxt.U.values(this.parent.deps).map(pkg => loadDepsRecursive(null, pkg, true)));
            })
                .then(() => {
                pxt.debug(`  installed ${this.id}`);
            });
        }
        getFiles() {
            let res;
            if (this.level == 0 && !this.ignoreTests)
                res = this.config.files.concat(this.config.testFiles || []);
            else
                res = this.config.files.slice(0);
            const fd = this.config.fileDependencies;
            if (this.config.fileDependencies)
                res = res.filter(fn => {
                    const evalCond = (cond) => {
                        cond = cond.trim();
                        if (cond[0] == '!')
                            return !evalCond(cond.slice(1));
                        if (/^[\w-]+$/.test(cond)) {
                            const dep = this.parent.resolveDep(cond);
                            if (dep && !dep.cppOnly)
                                return true;
                            return false;
                        }
                        const m = /^target:(\w+)$/.exec(cond);
                        if (m)
                            return m[1] == pxt.appTarget.id || m[1] == pxt.appTarget.platformid;
                        if (!Package.depWarnings[cond]) {
                            Package.depWarnings[cond] = true;
                            pxt.log(`invalid dependency expression: ${cond} in ${this.id}/${fn}`);
                        }
                        return false;
                    };
                    const cond = pxt.U.lookup(fd, fn);
                    if (!cond || !cond.trim())
                        return true;
                    return cond.split('||').some(c => c.split('&&').every(evalCond));
                });
            return res;
        }
        addSnapshot(files, exts = [""]) {
            for (let fn of this.getFiles()) {
                if (exts.some(e => pxt.U.endsWith(fn, e))) {
                    files[this.id + "/" + fn] = this.readFile(fn);
                }
            }
            files[this.id + "/" + pxt.CONFIG_NAME] = this.readFile(pxt.CONFIG_NAME);
        }
        /**
         * Returns localized strings qName -> translation
         */
        packageLocalizationStringsAsync(lang) {
            const targetId = pxt.appTarget.id;
            const filenames = [this.config.name + "-jsdoc", this.config.name];
            const r = {};
            const theme = pxt.appTarget.appTheme || {};
            if (this.config.skipLocalization)
                return Promise.resolve(r);
            // live loc of bundled packages
            if (pxt.Util.liveLocalizationEnabled() && this.id != "this" && pxt.appTarget.bundledpkgs[this.id]) {
                pxt.debug(`loading live translations for ${this.id}`);
                return Promise.all(filenames.map(fn => pxt.Util.downloadLiveTranslationsAsync(lang, `${targetId}/${fn}-strings.json`, theme.crowdinBranch)
                    .then(tr => {
                    if (tr && Object.keys(tr).length) {
                        pxt.Util.jsonMergeFrom(r, tr);
                    }
                    else {
                        pxt.tickEvent("translations.livetranslationsfailed", { "filename": fn });
                        pxt.Util.jsonMergeFrom(r, this.bundledStringsForFile(lang, fn));
                    }
                })
                    .catch(e => {
                    pxt.tickEvent("translations.livetranslationsfailed", { "filename": fn });
                    pxt.log(`error while downloading ${targetId}/${fn}-strings.json`);
                    pxt.Util.jsonMergeFrom(r, this.bundledStringsForFile(lang, fn));
                }))).then(() => r);
            }
            else {
                filenames.map(name => {
                    return this.bundledStringsForFile(lang, name);
                }).filter(d => !!d).forEach(d => pxt.Util.jsonMergeFrom(r, d));
                return Promise.resolve(r);
            }
        }
        bundledStringsForFile(lang, filename) {
            let r = {};
            let [initialLang, baseLang, initialLangLowerCase] = pxt.Util.normalizeLanguageCode(lang);
            const files = this.config.files;
            let fn = `_locales/${initialLang}/${filename}-strings.json`;
            if (files.indexOf(fn) > -1) {
                r = JSON.parse(this.readFile(fn));
            }
            else if (initialLangLowerCase) {
                fn = `_locales/${initialLangLowerCase}/${filename}-strings.json`;
                if (files.indexOf(fn) > -1)
                    r = JSON.parse(this.readFile(fn));
                else if (baseLang) {
                    fn = `_locales/${baseLang}/${filename}-strings.json`;
                    if (files.indexOf(fn) > -1) {
                        r = JSON.parse(this.readFile(fn));
                    }
                }
            }
            return r;
        }
    }
    Package.depWarnings = {};
    pxt.Package = Package;
    class MainPackage extends Package {
        constructor(_host) {
            super("this", "file:.", null, null);
            this._host = _host;
            this.deps = {};
            this.parent = this;
            this.addedBy = [this];
            this.level = 0;
            this.deps[this.id] = this;
        }
        installAllAsync(targetVersion) {
            return this.loadAsync(true, targetVersion);
        }
        sortedDeps(includeCpp = false) {
            let visited = {};
            let ids = [];
            const weight = (p) => p.config ? Object.keys(p.config.cppDependencies || {}).length : 0;
            const rec = (p) => {
                if (!p || pxt.U.lookup(visited, p.id))
                    return;
                visited[p.id] = true;
                const depNames = Object.keys(p.dependencies(includeCpp));
                const deps = depNames.map(id => this.resolveDep(id));
                // packages with more cppDependencies (core---* most likely) come first
                deps.sort((a, b) => weight(b) - weight(a) || pxt.U.strcmp(a.id, b.id));
                deps.forEach(rec);
                ids.push(p.id);
            };
            rec(this);
            return ids.map(id => this.resolveDep(id));
        }
        localizationStringsAsync(lang) {
            const loc = {};
            return Promise.all(pxt.Util.values(this.deps).map(dep => dep.packageLocalizationStringsAsync(lang)
                .then(depLoc => {
                if (depLoc) // merge data
                    Object.keys(depLoc).forEach(k => {
                        if (!loc[k])
                            loc[k] = depLoc[k];
                    });
            })))
                .then(() => {
                // Subcategories and groups are translated in their respective package, but are not really APIs so
                // there's no way for the translation to be saved with a block. To work around this, we copy the
                // translations to the editor translations.
                const strings = pxt.U.getLocalizedStrings();
                Object.keys(loc).forEach((l) => {
                    if (pxt.U.startsWith(l, "{id:subcategory}") || pxt.U.startsWith(l, "{id:group}")) {
                        if (!strings[l]) {
                            strings[l] = loc[l];
                        }
                    }
                });
                pxt.U.setLocalizedStrings(strings);
                return Promise.resolve(loc);
            });
        }
        getTargetOptions() {
            let res = pxt.U.clone(pxt.appTarget.compile);
            pxt.U.assert(!!res);
            if (!res.utf8) {
                this.sortedDeps(true).forEach(p => {
                    if (p.config && p.config.utf8) {
                        pxt.debug("forcing utf8 mode: pkg=" + p.id);
                        res.utf8 = true;
                    }
                });
            }
            return res;
        }
        getJRes() {
            if (!this._jres) {
                this._jres = {};
                for (const pkg of this.sortedDeps()) {
                    pkg.parseJRes(this._jres);
                }
                const palBuf = (pxt.appTarget.runtime && pxt.appTarget.runtime.palette ? pxt.appTarget.runtime.palette : ["#000000", "#ffffff"])
                    .map(s => ("000000" + parseInt(s.replace(/#/, ""), 16).toString(16)).slice(-6))
                    .join("");
                this._jres["__palette"] = {
                    id: "__palette",
                    data: palBuf,
                    dataEncoding: "hex",
                    mimeType: "application/x-palette"
                };
            }
            return this._jres;
        }
        updateJRes() {
            if (this._jres) {
                this.parseJRes(this._jres);
            }
        }
        resolveBannedCategories() {
            if (this._resolvedBannedCategories !== undefined)
                return this._resolvedBannedCategories; // cache hit
            let bannedCategories = [];
            if (pxt.appTarget && pxt.appTarget.runtime
                && pxt.appTarget.runtime.bannedCategories
                && pxt.appTarget.runtime.bannedCategories.length) {
                bannedCategories = pxt.appTarget.runtime.bannedCategories.slice();
                // scan for unbanned categories
                Object.keys(this.deps)
                    .map(dep => this.deps[dep])
                    .filter(dep => !!dep)
                    .map(pk => pxt.Util.jsonTryParse(pk.readFile(pxt.CONFIG_NAME)))
                    .filter(config => config && config.requiredCategories)
                    .forEach(config => config.requiredCategories.forEach(rc => {
                    const i = bannedCategories.indexOf(rc);
                    if (i > -1)
                        bannedCategories.splice(i, 1);
                }));
                this._resolvedBannedCategories = bannedCategories;
            }
            this._resolvedBannedCategories = bannedCategories;
            if (!this._resolvedBannedCategories.length)
                this._resolvedBannedCategories = null;
            return this._resolvedBannedCategories;
        }
        async getCompileOptionsAsync(target = this.getTargetOptions()) {
            let opts = {
                sourceFiles: [],
                fileSystem: {},
                target: target,
                name: this.config ? this.config.name : ""
            };
            const generateFile = (fn, cont) => {
                if (this.config.files.indexOf(fn) < 0)
                    pxt.U.userError(lf("please add '{0}' to \"files\" in {1}", fn, pxt.CONFIG_NAME));
                cont = "// Auto-generated. Do not edit.\n" + cont + "\n// Auto-generated. Do not edit. Really.\n";
                if (this.host().readFile(this, fn, true) !== cont) {
                    pxt.debug(`updating ${fn} (size=${cont.length})...`);
                    this.host().writeFile(this, fn, cont, true);
                }
            };
            let shimsGenerated = false;
            const fillExtInfoAsync = async (variant) => {
                const res = {
                    extinfo: null,
                    target: null
                };
                const prevVariant = pxt.appTargetVariant;
                if (variant)
                    pxt.setAppTargetVariant(variant, { temporary: true });
                try {
                    let einfo = pxt.cpp.getExtensionInfo(this);
                    if (!shimsGenerated && (einfo.shimsDTS || einfo.enumsDTS)) {
                        shimsGenerated = true;
                        if (einfo.shimsDTS)
                            generateFile("shims.d.ts", einfo.shimsDTS);
                        if (einfo.enumsDTS)
                            generateFile("enums.d.ts", einfo.enumsDTS);
                    }
                    const inf = target.isNative ? await this.host().getHexInfoAsync(einfo) : null;
                    einfo = pxt.U.flatClone(einfo);
                    if (!target.keepCppFiles) {
                        delete einfo.compileData;
                        delete einfo.generatedFiles;
                        delete einfo.extensionFiles;
                    }
                    einfo.hexinfo = inf;
                    res.extinfo = einfo;
                    res.target = pxt.appTarget.compile;
                }
                finally {
                    if (variant)
                        pxt.setAppTargetVariant(prevVariant, { temporary: true });
                }
                return res;
            };
            await this.loadAsync();
            opts.bannedCategories = this.resolveBannedCategories();
            opts.target.preferredEditor = this.getPreferredEditor();
            pxt.debug(`building: ${this.sortedDeps().map(p => p.config.name).join(", ")}`);
            let variants;
            if (pxt.appTarget.multiVariants) {
                // multiVariant available
                if (pxt.appTargetVariant) {
                    // set explicitly by the user
                    variants = [pxt.appTargetVariant];
                }
                else if (pxt.appTarget.alwaysMultiVariant || pxt.appTarget.compile.switches.multiVariant) {
                    // multivariants enabled
                    variants = pxt.appTarget.multiVariants;
                }
                else {
                    // not enbaled - default to first variant
                    variants = [pxt.appTarget.multiVariants[0]];
                }
            }
            else {
                // no multi-variants, use empty variant name,
                // so we don't mess with pxt.setAppTargetVariant() in fillExtInfoAsync()
                variants = [null];
            }
            let ext = null;
            for (let v of variants) {
                if (ext)
                    pxt.debug(`building for ${v}`);
                const etarget = await fillExtInfoAsync(v);
                const einfo = etarget.extinfo;
                einfo.appVariant = v;
                einfo.outputPrefix = variants.length == 1 || !v ? "" : v + "-";
                if (ext) {
                    opts.otherMultiVariants.push(etarget);
                }
                else {
                    ext = einfo;
                    opts.otherMultiVariants = [];
                }
            }
            opts.extinfo = ext;
            const noFileEmbed = pxt.appTarget.compile.shortPointers ||
                pxt.appTarget.compile.nativeType == "vm" ||
                this.config.binaryonly ||
                !opts.target.isNative;
            if (!noFileEmbed) {
                const files = await this.filesToBePublishedAsync(true);
                const headerString = JSON.stringify({
                    name: this.config.name,
                    comment: this.config.description,
                    status: "unpublished",
                    scriptId: this.installedVersion,
                    cloudId: pxt.CLOUD_ID + pxt.appTarget.id,
                    editor: this.getPreferredEditor(),
                    targetVersions: pxt.appTarget.versions
                });
                const programText = JSON.stringify(files);
                const buf = await pxt.lzmaCompressAsync(headerString + programText);
                if (buf) {
                    opts.embedMeta = JSON.stringify({
                        compression: "LZMA",
                        headerSize: headerString.length,
                        textSize: programText.length,
                        name: this.config.name,
                        eURL: pxt.appTarget.appTheme.embedUrl,
                        eVER: pxt.appTarget.versions ? pxt.appTarget.versions.target : "",
                        pxtTarget: pxt.appTarget.id,
                    });
                    opts.embedBlob = ts.pxtc.encodeBase64(pxt.U.uint8ArrayToString(buf));
                }
            }
            for (const pkg of this.sortedDeps()) {
                for (const f of pkg.getFiles()) {
                    if (/\.(ts|asm|py)$/.test(f)) {
                        let sn = f;
                        if (pkg.level > 0)
                            sn = "pxt_modules/" + pkg.id + "/" + f;
                        opts.sourceFiles.push(sn);
                        opts.fileSystem[sn] = pkg.readFile(f);
                    }
                }
            }
            opts.jres = this.getJRes();
            const functionOpts = pxt.appTarget.runtime && pxt.appTarget.runtime.functionsOptions;
            opts.allowedArgumentTypes = functionOpts && functionOpts.extraFunctionEditorTypes && functionOpts.extraFunctionEditorTypes.map(info => info.typeName).concat("number", "boolean", "string");
            return opts;
        }
        prepareConfigToBePublished() {
            const cfg = pxt.U.clone(this.config);
            delete cfg.installedVersion; // cleanup old pxt.json files
            delete cfg.additionalFilePath;
            delete cfg.additionalFilePaths;
            if (!cfg.targetVersions)
                cfg.targetVersions = pxt.Util.clone(pxt.appTarget.versions);
            pxt.U.iterMap(cfg.dependencies, (k, v) => {
                if (!v || /^(file|workspace):/.test(v)) {
                    v = "*";
                    try {
                        const d = this.resolveDep(k);
                        const gitjson = d.readGitJson();
                        if (gitjson && gitjson.repo) {
                            let parsed = pxt.github.parseRepoId(gitjson.repo);
                            parsed.tag = gitjson.commit.tag || gitjson.commit.sha;
                            v = pxt.github.stringifyRepo(parsed);
                        }
                    }
                    catch (e) { }
                    cfg.dependencies[k] = v;
                }
            });
            return cfg;
        }
        filesToBePublishedAsync(allowPrivate = false) {
            const files = {};
            return this.loadAsync()
                .then(() => {
                if (!allowPrivate && !this.config.public)
                    pxt.U.userError('Only packages with "public":true can be published');
                const cfg = this.prepareConfigToBePublished();
                files[pxt.CONFIG_NAME] = pxt.Package.stringifyConfig(cfg);
                for (let f of this.getFiles()) {
                    // already stored
                    if (f == pxt.CONFIG_NAME)
                        continue;
                    let str = this.readFile(f);
                    if (str == null)
                        pxt.U.userError("referenced file missing: " + f);
                    files[f] = str;
                }
                return pxt.U.sortObjectFields(files);
            });
        }
        saveToJsonAsync() {
            return this.filesToBePublishedAsync(true)
                .then(files => {
                const project = {
                    meta: {
                        cloudId: pxt.CLOUD_ID + pxt.appTarget.id,
                        targetVersions: pxt.appTarget.versions,
                        editor: this.getPreferredEditor(),
                        name: this.config.name
                    },
                    source: JSON.stringify(files, null, 2)
                };
                return project;
            });
        }
        compressToFileAsync() {
            return this.saveToJsonAsync()
                .then(project => pxt.lzmaCompressAsync(JSON.stringify(project, null, 2)));
        }
        computePartDefinitions(parts) {
            if (!parts || !parts.length)
                return {};
            let res = {};
            this.sortedDeps().forEach(d => {
                let pjson = d.readFile("pxtparts.json");
                if (pjson) {
                    try {
                        let p = JSON.parse(pjson);
                        Object.keys(p).forEach(k => {
                            if (parts.indexOf(k) >= 0) {
                                let part = res[k] = p[k];
                                if (typeof part.visual.image === "string" && /\.svg$/i.test(part.visual.image)) {
                                    let f = d.readFile(part.visual.image);
                                    if (!f)
                                        pxt.reportError("parts", "invalid part definition", { "error": `missing visual ${part.visual.image}` });
                                    if (!/^data:image\/svg\+xml/.test(f)) // encode svg if not encoded yet
                                        f = `data:image/svg+xml,` + encodeURIComponent(f);
                                    part.visual.image = f;
                                }
                            }
                        });
                    }
                    catch (e) {
                        pxt.reportError("parts", "invalid pxtparts.json file");
                    }
                }
            });
            return res;
        }
    }
    pxt.MainPackage = MainPackage;
    function inflateJRes(js, allres = {}) {
        let base = js["*"] || {};
        for (let k of Object.keys(js)) {
            if (k == "*")
                continue;
            let v = js[k];
            if (typeof v == "string") {
                // short form
                v = { data: v };
            }
            let ns = v.namespace || base.namespace || "";
            if (ns)
                ns += ".";
            let id = v.id || ns + k;
            let icon = v.icon;
            let mimeType = v.mimeType || base.mimeType;
            let dataEncoding = v.dataEncoding || base.dataEncoding || "base64";
            if (!icon && dataEncoding == "base64" && (mimeType == "image/png" || mimeType == "image/jpeg")) {
                icon = "data:" + mimeType + ";base64," + v.data;
            }
            allres[id] = {
                id,
                data: v.data,
                dataEncoding,
                icon,
                namespace: ns,
                mimeType,
                tilemapTile: v.tilemapTile,
                displayName: v.displayName,
                tileset: v.tileset
            };
        }
        return allres;
    }
    pxt.inflateJRes = inflateJRes;
    function allPkgFiles(cfg) {
        return [pxt.CONFIG_NAME].concat(cfg.files || []).concat(cfg.testFiles || []);
    }
    pxt.allPkgFiles = allPkgFiles;
    function isPkgBeta(cfg) {
        return cfg && /\bbeta\b/.test(cfg.description);
    }
    pxt.isPkgBeta = isPkgBeta;
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var packetio;
    (function (packetio) {
        let wrapper;
        let initPromise;
        let onConnectionChangedHandler = () => { };
        let onSerialHandler;
        let onCustomEventHandler;
        /**
         * A DAP wrapper is active
         */
        function isActive() {
            return !!wrapper;
        }
        packetio.isActive = isActive;
        /**
         * The DAP wrapper is active and the device is connected
         */
        function isConnected() {
            return !!wrapper && wrapper.io.isConnected();
        }
        packetio.isConnected = isConnected;
        function isConnecting() {
            return !!wrapper && wrapper.io.isConnecting();
        }
        packetio.isConnecting = isConnecting;
        function icon() {
            var _a;
            return !!wrapper && (wrapper.icon || ((_a = pxt.appTarget.appTheme.downloadDialogTheme) === null || _a === void 0 ? void 0 : _a.deviceIcon) || "usb");
        }
        packetio.icon = icon;
        function unsupportedParts() {
            return (wrapper === null || wrapper === void 0 ? void 0 : wrapper.unsupportedParts) ? wrapper.unsupportedParts() : [];
        }
        packetio.unsupportedParts = unsupportedParts;
        let disconnectPromise;
        function disconnectAsync() {
            if (disconnectPromise)
                return disconnectPromise;
            let p = Promise.resolve();
            if (wrapper) {
                pxt.debug('packetio: disconnect');
                const w = wrapper;
                p = p.then(() => w.disconnectAsync())
                    .then(() => w.io.disposeAsync())
                    .catch(e => {
                    // swallow execeptions
                    pxt.reportException(e);
                })
                    .finally(() => {
                    initPromise = undefined; // dubious
                    wrapper = undefined;
                    disconnectPromise = undefined;
                });
                if (onConnectionChangedHandler)
                    p = p.then(() => onConnectionChangedHandler());
                disconnectPromise = p;
            }
            return p;
        }
        packetio.disconnectAsync = disconnectAsync;
        function configureEvents(onConnectionChanged, onSerial, onCustomEvent) {
            onConnectionChangedHandler = onConnectionChanged;
            onSerialHandler = onSerial;
            onCustomEventHandler = onCustomEvent;
            if (wrapper) {
                wrapper.io.onConnectionChanged = onConnectionChangedHandler;
                wrapper.onSerial = onSerialHandler;
                wrapper.onCustomEvent = onCustomEvent;
            }
        }
        packetio.configureEvents = configureEvents;
        function sendCustomEventAsync(type, payload) {
            if (wrapper)
                return wrapper.sendCustomEventAsync(type, payload);
            else
                return Promise.resolve();
        }
        packetio.sendCustomEventAsync = sendCustomEventAsync;
        function wrapperAsync() {
            if (wrapper)
                return Promise.resolve(wrapper);
            if (!packetio.mkPacketIOAsync) {
                pxt.debug(`packetio: not defined, skipping`);
                return Promise.resolve(undefined);
            }
            pxt.debug(`packetio: new wrapper`);
            return packetio.mkPacketIOAsync()
                .then(io => {
                io.onConnectionChanged = onConnectionChangedHandler;
                wrapper = packetio.mkPacketIOWrapper(io);
                if (onSerialHandler)
                    wrapper.onSerial = onSerialHandler;
                if (onCustomEventHandler)
                    wrapper.onCustomEvent = onCustomEventHandler;
                // trigger ui update
                if (onConnectionChangedHandler)
                    onConnectionChangedHandler();
                return wrapper;
            });
        }
        function initAsync(force = false) {
            pxt.debug(`packetio: init ${force ? "(force)" : ""}`);
            if (!initPromise) {
                let p = Promise.resolve();
                if (force)
                    p = p.then(() => disconnectAsync());
                initPromise = p.then(() => wrapperAsync())
                    .finally(() => { initPromise = undefined; });
            }
            return initPromise;
        }
        packetio.initAsync = initAsync;
    })(packetio = pxt.packetio || (pxt.packetio = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var patching;
    (function (patching) {
        function computePatches(version, kind) {
            const patches = pxt.appTarget.compile ? pxt.appTarget.compile.patches : undefined;
            if (!patches)
                return undefined;
            const v = pxt.semver.tryParse(version || "0.0.0") || pxt.semver.tryParse("0.0.0");
            let r = [];
            Object.keys(patches)
                .filter(rng => pxt.semver.inRange(rng, v))
                .forEach(rng => r = r.concat(patches[rng]));
            if (kind)
                r = r.filter(p => p.type == kind);
            return r.length ? r : undefined;
        }
        patching.computePatches = computePatches;
        function upgradePackageReference(pkgTargetVersion, pkg, val) {
            if (val != "*")
                return pkg;
            const upgrades = pxt.patching.computePatches(pkgTargetVersion, "package");
            let newPackage = pkg;
            if (upgrades) {
                upgrades.forEach(rule => {
                    Object.keys(rule.map).forEach(match => {
                        if (newPackage == match) {
                            newPackage = rule.map[match];
                        }
                    });
                });
            }
            return newPackage;
        }
        patching.upgradePackageReference = upgradePackageReference;
        function patchJavaScript(pkgTargetVersion, fileContents) {
            const upgrades = pxt.patching.computePatches(pkgTargetVersion);
            let updatedContents = fileContents;
            if (upgrades) {
                upgrades.filter(u => u.type === "api").forEach(rule => {
                    Object.keys(rule.map).forEach(match => {
                        const regex = new RegExp(match, 'g');
                        updatedContents = updatedContents.replace(regex, rule.map[match]);
                    });
                });
                upgrades.filter(u => u.type === "userenum").forEach(rule => {
                    Object.keys(rule.map).forEach(enumName => {
                        const declRegex = new RegExp("enum\\s+" + enumName + "\\s*{", 'gm');
                        updatedContents = updatedContents.replace(declRegex, `enum ${rule.map[enumName]} {`);
                        const usageRegex = new RegExp(`(^|[^_a-zA-Z0-9])${enumName}(\\s*\\.)`, 'g');
                        updatedContents = updatedContents.replace(usageRegex, `$1${rule.map[enumName]}$2`);
                    });
                });
            }
            return updatedContents;
        }
        patching.patchJavaScript = patchJavaScript;
    })(patching = pxt.patching || (pxt.patching = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var react;
    (function (react) {
    })(react = pxt.react || (pxt.react = {}));
})(pxt || (pxt = {}));
// see http://semver.org/
var pxt;
(function (pxt) {
    var semver;
    (function (semver) {
        function cmp(a, b) {
            if (!a)
                if (!b)
                    return 0;
                else
                    return 1;
            else if (!b)
                return -1;
            else {
                let d = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
                if (d)
                    return d;
                if (a.pre.length == 0 && b.pre.length > 0)
                    return 1;
                if (a.pre.length > 0 && b.pre.length == 0)
                    return -1;
                for (let i = 0; i < a.pre.length + 1; ++i) {
                    let aa = a.pre[i];
                    let bb = b.pre[i];
                    if (!aa)
                        if (!bb)
                            return 0;
                        else
                            return -1;
                    else if (!bb)
                        return 1;
                    else if (/^\d+$/.test(aa))
                        if (/^\d+$/.test(bb)) {
                            d = parseInt(aa) - parseInt(bb);
                            if (d)
                                return d;
                        }
                        else
                            return -1;
                    else if (/^\d+$/.test(bb))
                        return 1;
                    else {
                        d = pxt.U.strcmp(aa, bb);
                        if (d)
                            return d;
                    }
                }
                return 0;
            }
        }
        semver.cmp = cmp;
        function parse(v, defaultVersion) {
            let r = tryParse(v) || tryParse(defaultVersion);
            if (!r)
                pxt.U.userError(pxt.U.lf("'{0}' doesn't look like a semantic version number", v));
            return r;
        }
        semver.parse = parse;
        function tryParse(v) {
            if (!v)
                return null;
            if ("*" === v) {
                return {
                    major: Number.MAX_SAFE_INTEGER,
                    minor: Number.MAX_SAFE_INTEGER,
                    patch: Number.MAX_SAFE_INTEGER,
                    pre: [],
                    build: []
                };
            }
            if (/^v\d/i.test(v))
                v = v.slice(1);
            let m = /^(\d+)\.(\d+)\.(\d+)(-([0-9a-zA-Z\-\.]+))?(\+([0-9a-zA-Z\-\.]+))?$/.exec(v);
            if (m)
                return {
                    major: parseInt(m[1]),
                    minor: parseInt(m[2]),
                    patch: parseInt(m[3]),
                    pre: m[5] ? m[5].split(".") : [],
                    build: m[7] ? m[7].split(".") : []
                };
            return null;
        }
        semver.tryParse = tryParse;
        function normalize(v) {
            return stringify(parse(v));
        }
        semver.normalize = normalize;
        function stringify(v) {
            let r = v.major + "." + v.minor + "." + v.patch;
            if (v.pre.length)
                r += "-" + v.pre.join(".");
            if (v.build.length)
                r += "+" + v.build.join(".");
            return r;
        }
        semver.stringify = stringify;
        function majorCmp(a, b) {
            let aa = tryParse(a);
            let bb = tryParse(b);
            return aa.major - bb.major;
        }
        semver.majorCmp = majorCmp;
        function strcmp(a, b) {
            let aa = tryParse(a);
            let bb = tryParse(b);
            if (!aa && !bb)
                return pxt.U.strcmp(a, b);
            else
                return cmp(aa, bb);
        }
        semver.strcmp = strcmp;
        function inRange(rng, v) {
            let rngs = rng.split(' - ');
            if (rngs.length != 2)
                return false;
            let minInclusive = tryParse(rngs[0]);
            let maxExclusive = tryParse(rngs[1]);
            if (!minInclusive || !maxExclusive)
                return false;
            if (!v)
                return true;
            const lwr = cmp(minInclusive, v);
            const hr = cmp(v, maxExclusive);
            return lwr <= 0 && hr < 0;
        }
        semver.inRange = inRange;
        /**
         * Filters and sort tags from latest to oldest (semver wize)
         * @param tags
         */
        function sortLatestTags(tags) {
            const v = tags.filter(tag => !!semver.tryParse(tag));
            v.sort(strcmp);
            v.reverse();
            return v;
        }
        semver.sortLatestTags = sortLatestTags;
        function test() {
            console.log("Test semver");
            let d = [
                "0.9.0",
                "1.0.0-0.3.7",
                "1.0.0-alpha", "1.0.0-alpha.1",
                "1.0.0-alpha.beta", "1.0.0-beta",
                "1.0.0-beta.2", "1.0.0-beta.11",
                "1.0.0-rc.1",
                "1.0.0-x.7.z.92",
                "1.0.0",
                "1.0.1",
                "1.9.0", "1.10.0", "1.11.0"
            ];
            for (let i = 0; i < d.length; ++i) {
                let p = parse(d[i]);
                console.log(d[i], p);
                pxt.U.assert(stringify(p) == d[i]);
                for (let j = 0; j < d.length; ++j) {
                    let x = cmp(p, parse(d[j]));
                    console.log(d[i], d[j], x);
                    if (i < j)
                        pxt.U.assert(x < 0);
                    else if (i > j)
                        pxt.U.assert(x > 0);
                    else
                        pxt.U.assert(x == 0);
                }
            }
            const v = tryParse("1.2.3");
            pxt.U.assert(inRange("0.1.2 - 2.2.3", v));
            pxt.U.assert(inRange("1.2.3 - 2.2.3", v));
            pxt.U.assert(!inRange("0.0.0 - 1.2.3", v));
            pxt.U.assert(!inRange("1.2.4 - 4.2.3", v));
            pxt.U.assert(!inRange("0.0.0 - 0.0.1", v));
        }
        semver.test = test;
    })(semver = pxt.semver || (pxt.semver = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/pxtarget.d.ts"/>
/// <reference path="../localtypings/pxtpackage.d.ts"/>
var ts;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        pxtc.assert = pxtc.Util.assert;
        pxtc.oops = pxtc.Util.oops;
        pxtc.U = pxtc.Util;
        pxtc.ON_START_TYPE = "pxt-on-start";
        pxtc.ON_START_COMMENT = "on start"; // TODO: Localize? (adding lf doesn't work because this is run before translations are downloaded)
        pxtc.HANDLER_COMMENT = "code goes here"; // TODO: Localize? (adding lf doesn't work because this is run before translations are downloaded)
        pxtc.TS_STATEMENT_TYPE = "typescript_statement";
        pxtc.TS_DEBUGGER_TYPE = "debugger_keyword";
        pxtc.TS_BREAK_TYPE = "break_keyword";
        pxtc.TS_CONTINUE_TYPE = "continue_keyword";
        pxtc.TS_OUTPUT_TYPE = "typescript_expression";
        pxtc.TS_RETURN_STATEMENT_TYPE = "function_return";
        pxtc.PAUSE_UNTIL_TYPE = "pxt_pause_until";
        pxtc.COLLAPSED_BLOCK = "pxt_collapsed_block";
        pxtc.FUNCTION_DEFINITION_TYPE = "function_definition";
        pxtc.BINARY_JS = "binary.js";
        pxtc.BINARY_ASM = "binary.asm";
        pxtc.BINARY_HEX = "binary.hex";
        pxtc.BINARY_UF2 = "binary.uf2";
        pxtc.BINARY_ELF = "binary.elf";
        pxtc.BINARY_PXT64 = "binary.pxt64";
        pxtc.BINARY_ESP = "binary.bin";
        pxtc.NATIVE_TYPE_THUMB = "thumb";
        pxtc.NATIVE_TYPE_VM = "vm";
        function BuildSourceMapHelpers(sourceMap, tsFile, pyFile) {
            // Notes:
            //  lines are 0-indexed (Monaco they are 1-indexed)
            //  columns are 0-indexed (0th is first character)
            //  positions are 0-indexed, as if getting the index of a character in a file as a giant string (incl. new lines)
            //  line summation is the length of that line plus its newline plus all the lines before it; aka the position of the next line's first character
            //  end positions are zero-index but not inclusive, same behavior as substring
            const makeLineColPosConverters = (file) => {
                const lines = file.split("\n");
                const lineLengths = lines
                    .map(l => l.length);
                const lineLenSums = lineLengths
                    .reduce(({ lens, sum }, n) => ({ lens: [...lens, sum + n + 1], sum: sum + n + 1 }), { lens: [], sum: 0 })
                    .lens;
                const lineColToPos = (line, col) => {
                    let pos = (lineLenSums[line - 1] || 0) + col;
                    return pos;
                };
                const posToLineCol = (pos) => {
                    const line = lineLenSums
                        .reduce((curr, nextLen, i) => pos < nextLen ? curr : i + 1, 0);
                    const col = lineLengths[line] - (lineLenSums[line] - pos) + 1;
                    return [line, col];
                };
                return { posToLineCol, lineColToPos };
            };
            const lcp = {
                ts: makeLineColPosConverters(tsFile),
                py: makeLineColPosConverters(pyFile)
            };
            const intLen = (i) => i.endPos - i.startPos;
            const allOverlaps = (i, lang) => {
                const { startPos, endPos } = i;
                return sourceMap
                    .filter(i => {
                    // O(n), can we and should we do better?
                    return i[lang].startPos <= startPos && endPos <= i[lang].endPos;
                });
            };
            const smallestOverlap = (i, lang) => {
                const overlaps = allOverlaps(i, lang);
                return overlaps.reduce((p, n) => intLen(n[lang]) < intLen(p[lang]) ? n : p, overlaps[0]);
            };
            const os = {
                ts: {
                    allOverlaps: (i) => allOverlaps(i, "ts"),
                    smallestOverlap: (i) => smallestOverlap(i, "ts"),
                },
                py: {
                    allOverlaps: (i) => allOverlaps(i, "py"),
                    smallestOverlap: (i) => smallestOverlap(i, "py"),
                }
            };
            const makeLocToLoc = (inLang, outLang) => {
                const inLocToPosAndLen = (inLoc) => [lcp[inLang].lineColToPos(inLoc.line, inLoc.column), inLoc.length];
                const locToLoc = (inLoc) => {
                    const [inStartPos, inLen] = inLocToPosAndLen(inLoc);
                    const inEndPos = inStartPos + inLen;
                    const bestOverlap = smallestOverlap({ startPos: inStartPos, endPos: inEndPos }, inLang);
                    if (!bestOverlap)
                        return undefined;
                    const [outStartLine, outStartCol] = lcp[outLang].posToLineCol(bestOverlap[outLang].startPos);
                    const outLoc = {
                        fileName: `main.${outLang}`,
                        start: bestOverlap[outLang].startPos,
                        length: intLen(bestOverlap[outLang]),
                        line: outStartLine,
                        column: outStartCol
                    };
                    return outLoc;
                };
                return locToLoc;
            };
            const tsLocToPyLoc = makeLocToLoc("ts", "py");
            const pyLocToTsLoc = makeLocToLoc("py", "ts");
            const tsGetText = (i) => tsFile.substring(i.startPos, i.endPos);
            const pyGetText = (i) => pyFile.substring(i.startPos, i.endPos);
            return {
                ts: Object.assign(Object.assign(Object.assign({}, lcp.ts), os.ts), { locToLoc: tsLocToPyLoc, getText: tsGetText }),
                py: Object.assign(Object.assign(Object.assign({}, lcp.py), os.py), { locToLoc: pyLocToTsLoc, getText: pyGetText }),
            };
        }
        pxtc.BuildSourceMapHelpers = BuildSourceMapHelpers;
        function computeUsedParts(resp, filter) {
            if (!resp.usedSymbols || !pxt.appTarget.simulator || !pxt.appTarget.simulator.parts)
                return [];
            let parts = [];
            Object.keys(resp.usedSymbols).forEach(symbol => {
                let info = resp.usedSymbols[symbol];
                if (info && info.attributes.parts) {
                    let partsRaw = info.attributes.parts;
                    if (partsRaw) {
                        let partsSplit = partsRaw.split(/[ ,]+/);
                        partsSplit.forEach(p => {
                            if (0 < p.length && parts.indexOf(p) < 0) {
                                parts.push(p);
                            }
                        });
                    }
                }
            });
            if (filter) {
                const builtinParts = pxt.appTarget.simulator.boardDefinition.onboardComponents;
                if (builtinParts) {
                    if (filter === "ignorebuiltin") {
                        parts = parts.filter(p => builtinParts.indexOf(p) === -1);
                    }
                    else if (filter === "onlybuiltin") {
                        parts = parts.filter(p => builtinParts.indexOf(p) >= 0);
                    }
                }
            }
            //sort parts (so breadboarding layout is stable w.r.t. code ordering)
            parts.sort();
            parts = parts.reverse(); //not strictly necessary, but it's a little
            // nicer for demos to have "ledmatrix"
            // before "buttonpair"
            return parts;
        }
        pxtc.computeUsedParts = computeUsedParts;
        function buildSimJsInfo(compileResult) {
            return {
                js: compileResult.outfiles[pxtc.BINARY_JS],
                targetVersion: pxt.appTarget.versions.target,
                fnArgs: compileResult.usedArguments,
                parts: pxtc.computeUsedParts(compileResult, "ignorebuiltin"),
                usedBuiltinParts: pxtc.computeUsedParts(compileResult, "onlybuiltin"),
            };
        }
        pxtc.buildSimJsInfo = buildSimJsInfo;
        /**
         * Unlocalized category name for a symbol
         */
        function blocksCategory(si) {
            const n = !si ? undefined : (si.attributes.blockNamespace || si.namespace);
            return n ? pxtc.Util.capitalize(n.split('.')[0]) : undefined;
        }
        pxtc.blocksCategory = blocksCategory;
        function getBlocksInfo(info, categoryFilters) {
            var _a, _b;
            let blocks = [];
            const combinedSet = {};
            const combinedGet = {};
            const combinedChange = {};
            const enumsByName = {};
            const kindsByName = {};
            function addCombined(rtp, s) {
                const isGet = rtp == "get";
                const isSet = rtp == "set";
                const isNumberType = s.retType == "number";
                const m = isGet ? combinedGet : (isSet ? combinedSet : combinedChange);
                const mkey = `${s.namespace}.${s.retType}`;
                let ex = pxtc.U.lookup(m, mkey);
                if (!ex) {
                    const tp = `@${rtp}@`;
                    let paramNameShadow, paramValueShadow;
                    if (s.attributes.blockCombineShadow) {
                        // allowable %blockCombineShadow strings:-
                        //   '{name shadow},' or '{value shadow}' or ',{value shadow}' or '{name shadow},{value shadow}'
                        const attribute = s.attributes.blockCombineShadow;
                        const match = attribute.match(/^([^,.]*),?([^,.]*)$/);
                        if (match && match.length == 3) {
                            paramNameShadow = match[1].trim();
                            paramValueShadow = match[2].trim();
                            if (paramValueShadow.length == 0 && !pxtc.Util.endsWith(attribute, ",")) {
                                paramValueShadow = paramNameShadow;
                                paramNameShadow = "";
                            }
                        }
                    }
                    const varName = s.attributes.blockSetVariable || s.namespace.toLocaleLowerCase();
                    const paramName = `${varName}=${paramNameShadow || ""}`;
                    const paramValue = `value=${paramValueShadow || ""}`;
                    ex = m[mkey] = {
                        attributes: {
                            blockId: `${isNumberType ? s.namespace : mkey}_blockCombine_${rtp}`,
                            callingConvention: 0 /* Plain */,
                            group: s.attributes.group,
                            paramDefl: {},
                            jsDoc: isGet
                                ? pxtc.U.lf("Read value of a property on an object")
                                : pxtc.U.lf("Update value of property on an object")
                        },
                        name: tp,
                        namespace: s.namespace,
                        fileName: s.fileName,
                        qName: `${mkey}.${tp}`,
                        pkg: s.pkg,
                        kind: 2 /* Property */,
                        parameters: [
                            {
                                name: "property",
                                description: isGet ?
                                    pxtc.U.lf("the name of the property to read") :
                                    pxtc.U.lf("the name of the property to change"),
                                isEnum: true,
                                type: "@combined@"
                            },
                            {
                                name: "value",
                                description: isSet ?
                                    pxtc.U.lf("the new value of the property") :
                                    pxtc.U.lf("the amount by which to change the property"),
                                type: s.retType,
                            }
                        ].slice(0, isGet ? 1 : 2),
                        retType: isGet ? s.retType : "void",
                        combinedProperties: []
                    };
                    ex.attributes.block =
                        isGet ? pxtc.U.lf("%{0} %property", paramName) :
                            isSet ? pxtc.U.lf("set %{0} %property to %{1}", paramName, paramValue) :
                                pxtc.U.lf("change %{0} %property by %{1}", paramName, paramValue);
                    updateBlockDef(ex.attributes);
                    if (pxt.Util.isTranslationMode()) {
                        ex.attributes.translationId = ex.attributes.block;
                        // This kicks off async work but doesn't wait; give untranslated values to start with
                        // to avoid a race causing a crash.
                        ex.attributes.block = isGet ? `%${paramName} %property` :
                            isSet ? `set %${paramName} %property to %${paramValue}` :
                                `change %${paramName} %property by %${paramValue}`;
                        updateBlockDef(ex.attributes);
                        pxt.crowdin.inContextLoadAsync(ex.attributes.translationId)
                            .then(r => {
                            ex.attributes.block = r;
                            updateBlockDef(ex.attributes);
                        });
                    }
                    blocks.push(ex);
                }
                ex.combinedProperties.push(s.qName);
            }
            for (let s of pxtc.Util.values(info.byQName)) {
                if (s.attributes.shim === "ENUM_GET" && s.attributes.enumName && s.attributes.blockId) {
                    let didFail = false;
                    if (enumsByName[s.attributes.enumName]) {
                        console.warn(`Enum block ${s.attributes.blockId} trying to overwrite enum ${s.attributes.enumName}`);
                        didFail = true;
                    }
                    if (!s.attributes.enumMemberName) {
                        console.warn(`Enum block ${s.attributes.blockId} should specify enumMemberName`);
                        didFail = true;
                    }
                    if (!s.attributes.enumPromptHint) {
                        console.warn(`Enum block ${s.attributes.blockId} should specify enumPromptHint`);
                        didFail = true;
                    }
                    if (!s.attributes.enumInitialMembers || !s.attributes.enumInitialMembers.length) {
                        console.warn(`Enum block ${s.attributes.blockId} should specify enumInitialMembers`);
                        didFail = true;
                    }
                    if (didFail) {
                        continue;
                    }
                    const firstValue = parseInt(s.attributes.enumStartValue);
                    enumsByName[s.attributes.enumName] = {
                        blockId: s.attributes.blockId,
                        name: s.attributes.enumName,
                        memberName: s.attributes.enumMemberName,
                        firstValue: isNaN(firstValue) ? undefined : firstValue,
                        isBitMask: s.attributes.enumIsBitMask,
                        isHash: s.attributes.enumIsHash,
                        initialMembers: s.attributes.enumInitialMembers,
                        promptHint: s.attributes.enumPromptHint
                    };
                }
                if (s.attributes.shim === "KIND_GET" && s.attributes.blockId) {
                    const kindNamespace = s.attributes.kindNamespace || s.attributes.blockNamespace || s.namespace;
                    if (kindsByName[kindNamespace]) {
                        console.warn(`More than one block defined for kind ${kindNamespace}`);
                        continue;
                    }
                    const initialMembers = [];
                    if (info.byQName[kindNamespace]) {
                        for (const api of pxtc.Util.values(info.byQName)) {
                            if (api.namespace === kindNamespace && api.attributes.isKind) {
                                initialMembers.push(api.name);
                            }
                        }
                    }
                    kindsByName[kindNamespace] = {
                        blockId: s.attributes.blockId,
                        name: kindNamespace,
                        memberName: s.attributes.kindMemberName || kindNamespace,
                        initialMembers: initialMembers,
                        promptHint: s.attributes.enumPromptHint || pxtc.Util.lf("Create a new kind..."),
                        createFunctionName: s.attributes.kindCreateFunction || "create"
                    };
                }
                if (s.attributes.blockCombine) {
                    if (!/@set/.test(s.name)) {
                        addCombined("get", s);
                    }
                    if (!s.isReadOnly) {
                        if (s.retType == 'number') {
                            addCombined("change", s);
                        }
                        addCombined("set", s);
                    }
                }
                else if (!!s.attributes.block
                    && !s.attributes.fixedInstance
                    && s.kind != 7 /* EnumMember */
                    && s.kind != 5 /* Module */
                    && s.kind != 9 /* Interface */
                    && s.kind != 8 /* Class */) {
                    if (!s.attributes.blockId)
                        s.attributes.blockId = s.qName.replace(/\./g, "_");
                    if (s.attributes.block == "true") {
                        let b = pxtc.U.uncapitalize(s.name);
                        if (s.kind == 1 /* Method */ || s.kind == 2 /* Property */) {
                            b += " %" + s.namespace.toLowerCase();
                        }
                        const params = (_b = (_a = s.parameters) === null || _a === void 0 ? void 0 : _a.filter(pr => !parameterTypeIsArrowFunction(pr))) !== null && _b !== void 0 ? _b : [];
                        for (let p of params) {
                            b += " %" + p.name;
                        }
                        s.attributes.block = b;
                        updateBlockDef(s.attributes);
                    }
                    blocks.push(s);
                }
            }
            // derive common block properties from namespace
            for (let b of blocks) {
                let parent = pxtc.U.lookup(info.byQName, b.namespace);
                if (!parent)
                    continue;
                let pattr = parent.attributes;
                let battr = b.attributes;
                for (let n of ["blockNamespace", "color", "blockGap"]) {
                    if (battr[n] === undefined && pattr[n])
                        battr[n] = pattr[n];
                }
            }
            if (categoryFilters)
                filterCategories(categoryFilters);
            return {
                apis: info,
                blocks,
                blocksById: pxt.Util.toDictionary(blocks, b => b.attributes.blockId),
                enumsByName,
                kindsByName
            };
            function filterCategories(banned) {
                if (banned.length) {
                    blocks = blocks.filter(b => {
                        let ns = (b.attributes.blockNamespace || b.namespace).split('.')[0];
                        return banned.indexOf(ns) === -1;
                    });
                }
            }
        }
        pxtc.getBlocksInfo = getBlocksInfo;
        function tsSnippetToPySnippet(param, symbol) {
            const keywords = {
                "true": "True",
                "false": "False",
                "null": "None"
            };
            const key = keywords[param];
            if (key) {
                return key;
            }
            if ((symbol && symbol.kind == 6 /* Enum */) || (!symbol && param.includes("."))) {
                // Python enums are all caps
                const dotIdx = param.lastIndexOf(".");
                const left = param.substr(0, dotIdx);
                let right = param.substr(dotIdx + 1);
                right = pxtc.U.snakify(right).toUpperCase();
                return `${left}.${right}`;
            }
            return param;
        }
        pxtc.tsSnippetToPySnippet = tsSnippetToPySnippet;
        pxtc.apiLocalizationStrings = {};
        async function localizeApisAsync(apis, mainPkg) {
            const lang = pxtc.Util.userLanguage();
            if (lang == "en")
                return Promise.resolve(cleanLocalizations(apis));
            const langLower = lang.toLowerCase();
            const attrJsLocsKey = langLower + "|jsdoc";
            const attrBlockLocsKey = langLower + "|block";
            const loc = await mainPkg.localizationStringsAsync(lang);
            if (pxtc.apiLocalizationStrings)
                pxtc.Util.jsonMergeFrom(loc, pxtc.apiLocalizationStrings);
            const toLocalize = pxtc.Util.values(apis.byQName).filter(fn => fn.attributes._translatedLanguageCode !== lang);
            await pxtc.Util.promiseMapAll(toLocalize, async (fn) => {
                var _a, _b, _c;
                const altLocSrc = fn.attributes.useLoc || fn.attributes.blockAliasFor;
                const altLocSrcFn = altLocSrc && apis.byQName[altLocSrc];
                if (fn.attributes._untranslatedJsDoc)
                    fn.attributes.jsDoc = fn.attributes._untranslatedJsDoc;
                if (fn.attributes._untranslatedBlock)
                    fn.attributes.jsDoc = fn.attributes._untranslatedBlock;
                const lookupLoc = (locSuff, attrKey) => {
                    var _a, _b;
                    return loc[fn.qName + locSuff] || ((_a = fn.attributes.locs) === null || _a === void 0 ? void 0 : _a[attrKey])
                        || (altLocSrcFn && (loc[altLocSrcFn.qName + locSuff] || ((_b = altLocSrcFn.attributes.locs) === null || _b === void 0 ? void 0 : _b[attrKey])));
                };
                const locJsDoc = lookupLoc("", attrJsLocsKey);
                if (locJsDoc) {
                    if (!fn.attributes._untranslatedJsDoc) {
                        fn.attributes._untranslatedJsDoc = fn.attributes.jsDoc;
                    }
                    fn.attributes.jsDoc = locJsDoc;
                }
                (_a = fn.parameters) === null || _a === void 0 ? void 0 : _a.forEach(pi => {
                    const paramSuff = `|param|${pi.name}`;
                    const paramLocs = lookupLoc(paramSuff, langLower + paramSuff);
                    if (paramLocs) {
                        pi.description = paramLocs;
                    }
                });
                const nsDoc = loc['{id:category}' + pxtc.Util.capitalize(fn.qName)];
                let locBlock = loc[`${fn.qName}|block`] || ((_b = fn.attributes.locs) === null || _b === void 0 ? void 0 : _b[attrBlockLocsKey]);
                if (!locBlock && altLocSrcFn) {
                    const otherTranslation = loc[`${altLocSrcFn.qName}|block`] || ((_c = altLocSrcFn.attributes.locs) === null || _c === void 0 ? void 0 : _c[attrBlockLocsKey]);
                    const isSameBlockDef = fn.attributes.block === (altLocSrcFn.attributes._untranslatedBlock || altLocSrcFn.attributes.block);
                    if (isSameBlockDef && !!otherTranslation) {
                        locBlock = otherTranslation;
                    }
                }
                if (locBlock && pxt.Util.isTranslationMode()) {
                    // in translation mode, crowdin sends translation identifiers which break the block parsing
                    // push identifier in DOM so that crowdin sends back the actual translation
                    fn.attributes.translationId = locBlock;
                    locBlock = await pxt.crowdin.inContextLoadAsync(locBlock);
                }
                if (nsDoc) {
                    // Check for "friendly namespace"
                    if (fn.attributes.block) {
                        fn.attributes.block = locBlock || fn.attributes.block;
                    }
                    else {
                        fn.attributes.block = nsDoc;
                    }
                    updateBlockDef(fn.attributes);
                }
                else if (fn.attributes.block && locBlock) {
                    const ps = pxt.blocks.compileInfo(fn);
                    const oldBlock = fn.attributes.block;
                    fn.attributes.block = pxt.blocks.normalizeBlock(locBlock, err => {
                        pxt.tickEvent("loc.normalized", {
                            block: fn.attributes.block,
                            lang: lang,
                            error: err,
                        });
                    });
                    if (!fn.attributes._untranslatedBlock) {
                        fn.attributes._untranslatedBlock = oldBlock;
                    }
                    if (oldBlock != fn.attributes.block) {
                        updateBlockDef(fn.attributes);
                        const locps = pxt.blocks.compileInfo(fn);
                        if (!hasEquivalentParameters(ps, locps)) {
                            pxt.log(`block has non matching arguments: ${oldBlock} vs ${fn.attributes.block}`);
                            pxt.reportError(`loc.errors`, `invalid translations`, {
                                block: fn.attributes.blockId,
                                lang: lang,
                            });
                            fn.attributes.block = oldBlock;
                            updateBlockDef(fn.attributes);
                        }
                    }
                }
                else {
                    updateBlockDef(fn.attributes);
                }
                fn.attributes._translatedLanguageCode = lang;
            });
            return cleanLocalizations(apis);
        }
        pxtc.localizeApisAsync = localizeApisAsync;
        function cleanLocalizations(apis) {
            pxtc.Util.values(apis.byQName)
                .filter(fb => fb.attributes.block && /^{[^:]+:[^}]+}/.test(fb.attributes.block))
                .forEach(fn => { fn.attributes.block = fn.attributes.block.replace(/^{[^:]+:[^}]+}/, ''); });
            return apis;
        }
        function hasEquivalentParameters(a, b) {
            if (a.parameters.length != b.parameters.length) {
                pxt.debug(`Localized block has extra or missing parameters`);
                return false;
            }
            for (const aParam of a.parameters) {
                const bParam = b.actualNameToParam[aParam.actualName];
                if (!bParam
                    || aParam.type != bParam.type
                    || aParam.shadowBlockId != bParam.shadowBlockId) {
                    pxt.debug(`Parameter ${aParam.actualName} type or shadow block does not match after localization`);
                    return false;
                }
            }
            return true;
        }
        function emptyExtInfo() {
            let cs = pxt.appTarget.compileService;
            if (!cs)
                cs = {};
            const pio = !!cs.platformioIni;
            const docker = cs.buildEngine == "dockermake" || cs.buildEngine == "dockercross" || cs.buildEngine == "dockerespidf";
            const r = {
                functions: [],
                generatedFiles: {},
                extensionFiles: {},
                sha: "",
                compileData: "",
                shimsDTS: "",
                enumsDTS: "",
                onlyPublic: true
            };
            if (pio)
                r.platformio = { dependencies: {} };
            else if (docker)
                r.npmDependencies = {};
            else
                r.yotta = { config: {}, dependencies: {} };
            return r;
        }
        pxtc.emptyExtInfo = emptyExtInfo;
        const numberAttributes = ["weight", "imageLiteral", "topblockWeight"];
        const booleanAttributes = [
            "advanced",
            "handlerStatement",
            "afterOnStart",
            "optionalVariableArgs",
            "blockHidden",
            "constantShim",
            "blockCombine",
            "enumIsBitMask",
            "enumIsHash",
            "decompileIndirectFixedInstances",
            "topblock",
            "callInDebugger",
            "duplicateShadowOnDrag",
            "argsNullable"
        ];
        function parseCommentString(cmt) {
            let res = {
                paramDefl: {},
                callingConvention: 0 /* Plain */,
                _source: cmt
            };
            let didSomething = true;
            while (didSomething) {
                didSomething = false;
                cmt = cmt.replace(/\/\/%[ \t]*([\w\.-]+)(=(("[^"\n]*")|'([^'\n]*)'|([^\s]*)))?/, (f, n, d0, d1, v0, v1, v2) => {
                    let v = v0 ? JSON.parse(v0) : (d0 ? (v0 || v1 || v2) : "true");
                    if (!v)
                        v = "";
                    if (pxtc.U.startsWith(n, "block.loc.")) {
                        if (!res.locs)
                            res.locs = {};
                        res.locs[n.slice("block.loc.".length).toLowerCase() + "|block"] = v;
                    }
                    else if (pxtc.U.startsWith(n, "jsdoc.loc.")) {
                        if (!res.locs)
                            res.locs = {};
                        res.locs[n.slice("jsdoc.loc.".length).toLowerCase() + "|jsdoc"] = v;
                    }
                    else if (pxtc.U.contains(n, ".loc.")) {
                        if (!res.locs)
                            res.locs = {};
                        const p = n.slice(0, n.indexOf('.loc.'));
                        const l = n.slice(n.indexOf('.loc.') + '.loc.'.length);
                        res.locs[l + "|param|" + p] = v;
                    }
                    else if (pxtc.U.endsWith(n, ".defl")) {
                        if (v.indexOf(" ") > -1) {
                            res.paramDefl[n.slice(0, n.length - 5)] = `"${v}"`;
                        }
                        else {
                            res.paramDefl[n.slice(0, n.length - 5)] = v;
                        }
                        if (!res.explicitDefaults)
                            res.explicitDefaults = [];
                        res.explicitDefaults.push(n.slice(0, n.length - 5));
                    }
                    else if (pxtc.U.endsWith(n, ".shadow")) {
                        if (!res._shadowOverrides)
                            res._shadowOverrides = {};
                        res._shadowOverrides[n.slice(0, n.length - 7)] = v;
                    }
                    else if (pxtc.U.endsWith(n, ".fieldEditor")) {
                        if (!res.paramFieldEditor)
                            res.paramFieldEditor = {};
                        res.paramFieldEditor[n.slice(0, n.length - 12)] = v;
                    }
                    else if (pxtc.U.contains(n, ".fieldOptions.")) {
                        if (!res.paramFieldEditorOptions)
                            res.paramFieldEditorOptions = {};
                        const field = n.slice(0, n.indexOf('.fieldOptions.'));
                        const key = n.slice(n.indexOf('.fieldOptions.') + 14, n.length);
                        if (!res.paramFieldEditorOptions[field])
                            res.paramFieldEditorOptions[field] = {};
                        res.paramFieldEditorOptions[field][key] = v;
                    }
                    else if (pxtc.U.contains(n, ".shadowOptions.")) {
                        if (!res.paramShadowOptions)
                            res.paramShadowOptions = {};
                        const field = n.slice(0, n.indexOf('.shadowOptions.'));
                        const key = n.slice(n.indexOf('.shadowOptions.') + 15, n.length);
                        if (!res.paramShadowOptions[field])
                            res.paramShadowOptions[field] = {};
                        res.paramShadowOptions[field][key] = v;
                    }
                    else if (pxtc.U.endsWith(n, ".min")) {
                        if (!res.paramMin)
                            res.paramMin = {};
                        res.paramMin[n.slice(0, n.length - 4)] = v;
                    }
                    else if (pxtc.U.endsWith(n, ".max")) {
                        if (!res.paramMax)
                            res.paramMax = {};
                        res.paramMax[n.slice(0, n.length - 4)] = v;
                    }
                    else {
                        res[n] = v;
                    }
                    didSomething = true;
                    return "//% ";
                });
            }
            for (let n of numberAttributes) {
                if (typeof res[n] == "string")
                    res[n] = parseInt(res[n]);
            }
            for (let n of booleanAttributes) {
                if (typeof res[n] == "string")
                    res[n] = res[n] == 'true' || res[n] == '1' ? true : false;
            }
            if (res.trackArgs) {
                res.trackArgs = res.trackArgs.split(/[ ,]+/).map(s => parseInt(s) || 0);
            }
            if (res.enumInitialMembers) {
                res.enumInitialMembers = res.enumInitialMembers.split(/[ ,]+/);
            }
            if (res.blockExternalInputs && !res.inlineInputMode) {
                res.inlineInputMode = "external";
            }
            res.paramHelp = {};
            res.jsDoc = "";
            cmt = cmt.replace(/\/\*\*([^]*?)\*\//g, (full, doccmt) => {
                doccmt = doccmt.replace(/\n\s*(\*\s*)?/g, "\n");
                doccmt = doccmt.replace(/^\s*@param\s+(\w+)\s+(.*)$/mg, (full, name, desc) => {
                    res.paramHelp[name] = desc;
                    if (!res.paramDefl[name]) {
                        // these don't add to res.explicitDefaults
                        let m = /\beg\.?:\s*(.+)/.exec(desc);
                        if (m && m[1]) {
                            let defaultValue = /(?:"([^"]*)")|(?:'([^']*)')|(?:([^\s,]+))/g.exec(m[1]);
                            if (defaultValue) {
                                let val = defaultValue[1] || defaultValue[2] || defaultValue[3];
                                if (!val)
                                    val = "";
                                // If there are spaces in the value, it means the value was surrounded with quotes, so add them back
                                if (val.indexOf(" ") > -1) {
                                    res.paramDefl[name] = `"${val}"`;
                                }
                                else {
                                    res.paramDefl[name] = val;
                                }
                            }
                        }
                    }
                    return "";
                });
                res.jsDoc += doccmt;
                return "";
            });
            res.jsDoc = res.jsDoc.trim();
            if (res.async)
                res.callingConvention = 1 /* Async */;
            if (res.promise)
                res.callingConvention = 2 /* Promise */;
            if (res.jres)
                res.whenUsed = true;
            if (res.subcategories) {
                try {
                    res.subcategories = JSON.parse(res.subcategories);
                }
                catch (e) {
                    res.subcategories = undefined;
                }
            }
            if (res.groups) {
                try {
                    res.groups = JSON.parse(res.groups);
                }
                catch (e) {
                    res.groups = undefined;
                }
            }
            if (res.groupIcons) {
                try {
                    res.groupIcons = JSON.parse(res.groupIcons);
                }
                catch (e) {
                    res.groupIcons = undefined;
                }
            }
            if (res.groupHelp) {
                try {
                    res.groupHelp = JSON.parse(res.groupHelp);
                }
                catch (e) {
                    res.groupHelp = undefined;
                }
            }
            updateBlockDef(res);
            return res;
        }
        pxtc.parseCommentString = parseCommentString;
        function parameterTypeIsArrowFunction(pr) {
            return pr.type === "Action" || /^\([^\)]*\)\s*=>/.test(pr.type);
        }
        pxtc.parameterTypeIsArrowFunction = parameterTypeIsArrowFunction;
        function updateBlockDef(attrs) {
            if (attrs.block) {
                const parts = attrs.block.split("||");
                attrs._def = applyOverrides(parseBlockDefinition(parts[0]));
                if (!attrs._def)
                    pxt.debug("Unable to parse block def for id: " + attrs.blockId);
                if (parts[1])
                    attrs._expandedDef = applyOverrides(parseBlockDefinition(parts[1]));
                if (parts[1] && !attrs._expandedDef)
                    pxt.debug("Unable to parse expanded block def for id: " + attrs.blockId);
            }
            function applyOverrides(def) {
                if (attrs._shadowOverrides) {
                    def.parameters.forEach(p => {
                        const shadow = attrs._shadowOverrides[p.name];
                        if (shadow === "unset")
                            delete p.shadowBlockId;
                        else if (shadow != null)
                            p.shadowBlockId = shadow;
                    });
                }
                return def;
            }
        }
        pxtc.updateBlockDef = updateBlockDef;
        function parseBlockDefinition(def) {
            const tokens = [];
            let currentWord;
            let strIndex = 0;
            for (; strIndex < def.length; strIndex++) {
                const char = def[strIndex];
                const restoreIndex = strIndex;
                let newToken;
                switch (char) {
                    case "*":
                    case "_":
                        const tk = eatToken(c => c == char);
                        const offset = char === "_" ? 2 : 0;
                        if (tk.length === 1)
                            newToken = { kind: 1 /* SingleAsterisk */ << offset, content: tk };
                        else if (tk.length === 2)
                            newToken = { kind: 2 /* DoubleAsterisk */ << offset, content: tk };
                        else if (tk.length === 3)
                            newToken = { kind: 3 /* TripleAsterisk */ << offset, content: tk };
                        else
                            strIndex = restoreIndex; // error: no more than three style marks
                        break;
                    case "`":
                        const image = eatEnclosure("`");
                        if (image === undefined) {
                            strIndex = restoreIndex; // error: not terminated
                            break;
                        }
                        newToken = { kind: 256 /* Image */, content: image };
                        break;
                    case "|":
                        newToken = { kind: 32 /* Pipe */ };
                        break;
                    case "\\":
                        if (strIndex < (def.length - 1))
                            newToken = { kind: 16 /* Escape */, content: def[1 + (strIndex++)] };
                        break;
                    case "[":
                        const contentText = eatEnclosure("]");
                        if (contentText !== undefined && def[strIndex++ + 1] === "(") {
                            const contentClass = eatEnclosure(")");
                            if (contentClass !== undefined) {
                                newToken = { kind: 512 /* TaggedText */, content: contentText, type: contentClass };
                                break;
                            }
                        }
                        strIndex = restoreIndex; // error: format should be [text](class)
                        break;
                    case "$":
                    case "%":
                        const param = eatToken(c => /[a-zA-Z0-9_=]/.test(c), true).split("=");
                        if (param.length > 2) {
                            strIndex = restoreIndex; // error: too many equals signs
                            break;
                        }
                        let varName;
                        if (def[strIndex + 1] === "(") {
                            const oldIndex = strIndex;
                            ++strIndex;
                            varName = eatEnclosure(")");
                            if (!varName)
                                strIndex = oldIndex;
                        }
                        newToken = { kind: (char === "$") ? 1024 /* ParamRef */ : 64 /* Parameter */, content: param[0], type: param[1], name: varName };
                        break;
                }
                if (newToken) {
                    if (currentWord)
                        tokens.push({ kind: 128 /* Word */, content: currentWord });
                    currentWord = undefined;
                    tokens.push(newToken);
                }
                else if (!currentWord) {
                    currentWord = char;
                }
                else {
                    currentWord += char;
                }
            }
            if (currentWord)
                tokens.push({ kind: 128 /* Word */, content: currentWord });
            const parts = [];
            const parameters = [];
            let stack = [];
            let open = 0;
            let currentLabel = "";
            let labelStack = [];
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i].kind;
                const top = stack[stack.length - 1];
                if (token & 15 /* StyleMarks */) {
                    pushCurrentLabel(tokens[i].content);
                    if (token & open) {
                        if (top & token) {
                            stack.pop();
                            open ^= token;
                            // Handle triple tokens
                            const remainder = (top & open) | (token & open);
                            if (remainder) {
                                stack.push(remainder);
                            }
                        }
                        else {
                            // We encountered a mismatched mark, so clear previous styles
                            collapseLabels();
                        }
                    }
                    else {
                        open |= token;
                        stack.push(token);
                    }
                }
                else if (token & 144 /* Text */) {
                    currentLabel += tokens[i].content;
                }
                else if (token & 1120 /* Unstylable */) {
                    pushLabels();
                }
                if (token == 64 /* Parameter */) {
                    const param = { kind: "param", name: tokens[i].content, shadowBlockId: tokens[i].type, ref: false };
                    if (tokens[i].name)
                        param.varName = tokens[i].name;
                    parts.push(param);
                    parameters.push(param);
                }
                else if (token == 1024 /* ParamRef */) {
                    const param = { kind: "param", name: tokens[i].content, shadowBlockId: tokens[i].type, ref: true };
                    if (tokens[i].name)
                        param.varName = tokens[i].name;
                    parts.push(param);
                    parameters.push(param);
                }
                else if (token == 256 /* Image */) {
                    pushCurrentLabel();
                    labelStack.push({ kind: "image", uri: tokens[i].content });
                }
                else if (token == 512 /* TaggedText */) {
                    pushCurrentLabel();
                    labelStack.push({ kind: "label", text: tokens[i].content, cssClass: tokens[i].type });
                }
                else if (token == 32 /* Pipe */) {
                    parts.push({ kind: "break" });
                }
            }
            pushLabels();
            return { parts, parameters };
            function eatToken(pred, skipCurrent = false) {
                let current = "";
                if (skipCurrent)
                    strIndex++;
                while (strIndex < def.length && pred(def[strIndex])) {
                    current += def[strIndex];
                    ++strIndex;
                }
                if (current)
                    strIndex--;
                return current;
            }
            function eatEnclosure(endMark) {
                const content = eatToken(c => c !== endMark, true);
                if (def[strIndex + 1] !== endMark)
                    return undefined;
                ++strIndex;
                return content;
            }
            function collapseLabels() {
                let combined = "";
                let newStack = [];
                for (const item of labelStack) {
                    if (isBlockPart(item)) {
                        newStack.push({
                            content: combined,
                            styles: 0
                        });
                        newStack.push(item);
                        combined = "";
                    }
                    else {
                        combined += item.content;
                        if (item.endingToken) {
                            combined += item.endingToken;
                        }
                    }
                }
                labelStack = newStack;
                if (combined) {
                    labelStack.push({
                        content: combined,
                        styles: 0
                    });
                }
                // Clear the style state as well
                stack = [];
                open = 0;
            }
            function pushLabels() {
                pushCurrentLabel();
                if (open) {
                    collapseLabels();
                }
                while (labelStack.length) {
                    const label = labelStack.shift();
                    if (isBlockPart(label)) {
                        parts.push(label);
                    }
                    else {
                        if (!label.content)
                            continue;
                        const styles = [];
                        if (label.styles & 10 /* Bold */)
                            styles.push("bold");
                        if (label.styles & 5 /* Italics */)
                            styles.push("italics");
                        parts.push({ kind: "label", text: label.content, style: styles });
                    }
                }
            }
            function pushCurrentLabel(endingToken) {
                labelStack.push({
                    content: currentLabel,
                    styles: open,
                    endingToken
                });
                currentLabel = "";
            }
        }
        pxtc.parseBlockDefinition = parseBlockDefinition;
        function isBlockPart(p) {
            return !!(p.kind);
        }
        function parseChecksumBlock(buf, pos = 0) {
            let magic = pxt.HF2.read32(buf, pos);
            if ((magic & 0x7fffffff) != 0x07eeb07c) {
                pxt.log("no checksum block magic");
                return null;
            }
            let endMarkerPos = pxt.HF2.read32(buf, pos + 4);
            let endMarker = pxt.HF2.read32(buf, pos + 8);
            if (endMarkerPos & 3) {
                pxt.log("invalid end marker position");
                return null;
            }
            let pageSize = 1 << (endMarker & 0xff);
            if (pageSize != pxt.appTarget.compile.flashCodeAlign) {
                pxt.log("invalid page size: " + pageSize);
                return null;
            }
            let blk = {
                magic,
                endMarkerPos,
                endMarker,
                regions: []
            };
            for (let i = pos + 12; i < buf.length - 7; i += 8) {
                let r = {
                    start: pageSize * pxt.HF2.read16(buf, i),
                    length: pageSize * pxt.HF2.read16(buf, i + 2),
                    checksum: pxt.HF2.read32(buf, i + 4)
                };
                if (r.length && r.checksum) {
                    blk.regions.push(r);
                }
                else {
                    break;
                }
            }
            //console.log(hexDump(buf), blk)
            return blk;
        }
        pxtc.parseChecksumBlock = parseChecksumBlock;
        let UF2;
        (function (UF2) {
            UF2.UF2_MAGIC_START0 = 0x0A324655; // "UF2\n"
            UF2.UF2_MAGIC_START1 = 0x9E5D5157; // Randomly selected
            UF2.UF2_MAGIC_END = 0x0AB16F30; // Ditto
            UF2.UF2_FLAG_NONE = 0x00000000;
            UF2.UF2_FLAG_NOFLASH = 0x00000001;
            UF2.UF2_FLAG_FILE = 0x00001000;
            UF2.UF2_FLAG_FAMILY_ID_PRESENT = 0x00002000;
            function parseBlock(block) {
                let wordAt = (k) => {
                    return (block[k] + (block[k + 1] << 8) + (block[k + 2] << 16) + (block[k + 3] << 24)) >>> 0;
                };
                if (!block || block.length != 512 ||
                    wordAt(0) != UF2.UF2_MAGIC_START0 || wordAt(4) != UF2.UF2_MAGIC_START1 ||
                    wordAt(block.length - 4) != UF2.UF2_MAGIC_END)
                    return null;
                let flags = wordAt(8);
                let payloadSize = wordAt(16);
                if (payloadSize > 476)
                    payloadSize = 256;
                let filename = null;
                let familyId = 0;
                let fileSize = 0;
                if (flags & UF2.UF2_FLAG_FILE) {
                    let fnbuf = block.slice(32 + payloadSize);
                    let len = fnbuf.indexOf(0);
                    if (len >= 0) {
                        fnbuf = fnbuf.slice(0, len);
                    }
                    filename = pxtc.U.fromUTF8(pxtc.U.uint8ArrayToString(fnbuf));
                    fileSize = wordAt(28);
                }
                if (flags & UF2.UF2_FLAG_FAMILY_ID_PRESENT) {
                    familyId = wordAt(28);
                }
                return {
                    flags,
                    targetAddr: wordAt(12),
                    payloadSize,
                    blockNo: wordAt(20),
                    numBlocks: wordAt(24),
                    fileSize,
                    familyId,
                    data: block.slice(32, 32 + payloadSize),
                    filename
                };
            }
            UF2.parseBlock = parseBlock;
            function parseFile(blocks) {
                let r = [];
                for (let i = 0; i < blocks.length; i += 512) {
                    let b = parseBlock(blocks.slice(i, i + 512));
                    if (b)
                        r.push(b);
                }
                return r;
            }
            UF2.parseFile = parseFile;
            function toBin(blocks, endAddr = undefined) {
                if (blocks.length < 512)
                    return null;
                let curraddr = -1;
                let appstartaddr = -1;
                let bufs = [];
                for (let i = 0; i < blocks.length; ++i) {
                    let ptr = i * 512;
                    let bl = parseBlock(blocks.slice(ptr, ptr + 512));
                    if (!bl)
                        continue;
                    if (endAddr && bl.targetAddr + 256 > endAddr)
                        break;
                    if (curraddr == -1) {
                        curraddr = bl.targetAddr;
                        appstartaddr = curraddr;
                    }
                    let padding = bl.targetAddr - curraddr;
                    if (padding < 0 || padding % 4 || padding > 1024 * 1024)
                        continue;
                    if (padding > 0)
                        bufs.push(new Uint8Array(padding));
                    bufs.push(blocks.slice(ptr + 32, ptr + 32 + bl.payloadSize));
                    curraddr = bl.targetAddr + bl.payloadSize;
                }
                let len = 0;
                for (let b of bufs)
                    len += b.length;
                if (len == 0)
                    return null;
                let r = new Uint8Array(len);
                let dst = 0;
                for (let b of bufs) {
                    for (let i = 0; i < b.length; ++i)
                        r[dst++] = b[i];
                }
                return {
                    buf: r,
                    start: appstartaddr,
                };
            }
            UF2.toBin = toBin;
            function hasAddr(b, a) {
                if (!b)
                    return false;
                return b.targetAddr <= a && a < b.targetAddr + b.payloadSize;
            }
            function readBytes(blocks, addr, length) {
                let res = new Uint8Array(length);
                let bl;
                for (let i = 0; i < length; ++i, ++addr) {
                    if (!hasAddr(bl, addr))
                        bl = blocks.filter(b => hasAddr(b, addr))[0];
                    if (bl)
                        res[i] = bl.data[addr - bl.targetAddr];
                }
                return res;
            }
            UF2.readBytes = readBytes;
            function setWord(block, ptr, v) {
                block[ptr] = (v & 0xff);
                block[ptr + 1] = ((v >> 8) & 0xff);
                block[ptr + 2] = ((v >> 16) & 0xff);
                block[ptr + 3] = ((v >> 24) & 0xff);
            }
            function newBlockFile(familyId) {
                if (typeof familyId == "string")
                    familyId = parseInt(familyId);
                return {
                    currBlock: null,
                    currPtr: -1,
                    blocks: [],
                    ptrs: [],
                    filesize: 0,
                    familyId: familyId || 0
                };
            }
            UF2.newBlockFile = newBlockFile;
            function finalizeFile(f) {
                for (let i = 0; i < f.blocks.length; ++i) {
                    setWord(f.blocks[i], 20, i);
                    setWord(f.blocks[i], 24, f.blocks.length);
                    if (f.filename)
                        setWord(f.blocks[i], 28, f.filesize);
                }
            }
            UF2.finalizeFile = finalizeFile;
            function concatFiles(fs) {
                for (let f of fs) {
                    finalizeFile(f);
                    f.filename = null;
                }
                let r = newBlockFile();
                r.blocks = pxtc.U.concat(fs.map(f => f.blocks));
                for (let f of fs) {
                    f.blocks = [];
                }
                return r;
            }
            UF2.concatFiles = concatFiles;
            function serializeFile(f) {
                finalizeFile(f);
                let res = "";
                for (let b of f.blocks)
                    res += pxtc.Util.uint8ArrayToString(b);
                return res;
            }
            UF2.serializeFile = serializeFile;
            function readBytesFromFile(f, addr, length) {
                //console.log(`read @${addr} len=${length}`)
                let needAddr = addr >> 8;
                let bl;
                if (needAddr == f.currPtr)
                    bl = f.currBlock;
                else {
                    for (let i = 0; i < f.ptrs.length; ++i) {
                        if (f.ptrs[i] == needAddr) {
                            bl = f.blocks[i];
                            break;
                        }
                    }
                    if (bl) {
                        f.currPtr = needAddr;
                        f.currBlock = bl;
                    }
                }
                if (!bl)
                    return null;
                let res = new Uint8Array(length);
                let toRead = Math.min(length, 256 - (addr & 0xff));
                pxtc.U.memcpy(res, 0, bl, (addr & 0xff) + 32, toRead);
                let leftOver = length - toRead;
                if (leftOver > 0) {
                    let le = readBytesFromFile(f, addr + toRead, leftOver);
                    pxtc.U.memcpy(res, toRead, le);
                }
                return res;
            }
            UF2.readBytesFromFile = readBytesFromFile;
            function writeBytes(f, addr, bytes, flags = 0) {
                let currBlock = f.currBlock;
                let needAddr = addr >> 8;
                // account for unaligned writes
                let thisChunk = 256 - (addr & 0xff);
                if (bytes.length > thisChunk) {
                    let b = new Uint8Array(bytes);
                    writeBytes(f, addr, b.slice(0, thisChunk));
                    while (thisChunk < bytes.length) {
                        let nextOff = Math.min(thisChunk + 256, bytes.length);
                        writeBytes(f, addr + thisChunk, b.slice(thisChunk, nextOff));
                        thisChunk = nextOff;
                    }
                    return;
                }
                if (needAddr != f.currPtr) {
                    let i = 0;
                    currBlock = null;
                    for (let i = 0; i < f.ptrs.length; ++i) {
                        if (f.ptrs[i] == needAddr) {
                            currBlock = f.blocks[i];
                            break;
                        }
                    }
                    if (!currBlock) {
                        currBlock = new Uint8Array(512);
                        if (f.filename)
                            flags |= UF2.UF2_FLAG_FILE;
                        else if (f.familyId)
                            flags |= UF2.UF2_FLAG_FAMILY_ID_PRESENT;
                        setWord(currBlock, 0, UF2.UF2_MAGIC_START0);
                        setWord(currBlock, 4, UF2.UF2_MAGIC_START1);
                        setWord(currBlock, 8, flags);
                        setWord(currBlock, 12, needAddr << 8);
                        setWord(currBlock, 16, 256);
                        setWord(currBlock, 20, f.blocks.length);
                        setWord(currBlock, 28, f.familyId);
                        setWord(currBlock, 512 - 4, UF2.UF2_MAGIC_END);
                        // if bytes are not written, leave them at erase value
                        for (let i = 32; i < 32 + 256; ++i)
                            currBlock[i] = 0xff;
                        if (f.filename) {
                            pxtc.U.memcpy(currBlock, 32 + 256, pxtc.U.stringToUint8Array(pxtc.U.toUTF8(f.filename)));
                        }
                        f.blocks.push(currBlock);
                        f.ptrs.push(needAddr);
                    }
                    f.currPtr = needAddr;
                    f.currBlock = currBlock;
                }
                let p = (addr & 0xff) + 32;
                for (let i = 0; i < bytes.length; ++i)
                    currBlock[p + i] = bytes[i];
                f.filesize = Math.max(f.filesize, bytes.length + addr);
            }
            UF2.writeBytes = writeBytes;
            function writeHex(f, hex) {
                let upperAddr = "0000";
                for (let i = 0; i < hex.length; ++i) {
                    let m = /:02000004(....)/.exec(hex[i]);
                    if (m) {
                        upperAddr = m[1];
                    }
                    m = /^:..(....)00(.*)[0-9A-F][0-9A-F]$/.exec(hex[i]);
                    if (m) {
                        let newAddr = parseInt(upperAddr + m[1], 16);
                        let hh = m[2];
                        let arr = [];
                        for (let j = 0; j < hh.length; j += 2) {
                            arr.push(parseInt(hh[j] + hh[j + 1], 16));
                        }
                        writeBytes(f, newAddr, arr);
                    }
                }
            }
            UF2.writeHex = writeHex;
        })(UF2 = pxtc.UF2 || (pxtc.UF2 = {}));
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
var pxt;
(function (pxt) {
    var shell;
    (function (shell) {
        let EditorLayoutType;
        (function (EditorLayoutType) {
            EditorLayoutType[EditorLayoutType["IDE"] = 0] = "IDE";
            EditorLayoutType[EditorLayoutType["Sandbox"] = 1] = "Sandbox";
            EditorLayoutType[EditorLayoutType["Widget"] = 2] = "Widget";
            EditorLayoutType[EditorLayoutType["Controller"] = 3] = "Controller";
        })(EditorLayoutType = shell.EditorLayoutType || (shell.EditorLayoutType = {}));
        let layoutType;
        let editorReadonly = false;
        let noDefaultProject = false;
        function init() {
            if (layoutType !== undefined)
                return;
            if (!pxt.BrowserUtils.hasWindow()) {
                layoutType = EditorLayoutType.Sandbox;
            }
            else {
                const sandbox = /sandbox=1|#sandbox|#sandboxproject/i.test(window.location.href)
                    // in iframe
                    || pxt.BrowserUtils.isIFrame();
                const nosandbox = /nosandbox=1/i.test(window.location.href);
                const controller = /controller=1/i.test(window.location.href) && pxt.BrowserUtils.isIFrame();
                const readonly = /readonly=1/i.test(window.location.href);
                const layout = /editorlayout=(widget|sandbox|ide)/i.exec(window.location.href);
                const noproject = /noproject=1/i.test(window.location.href);
                layoutType = EditorLayoutType.IDE;
                if (nosandbox)
                    layoutType = EditorLayoutType.Widget;
                else if (controller)
                    layoutType = EditorLayoutType.Controller;
                else if (sandbox)
                    layoutType = EditorLayoutType.Sandbox;
                if (controller && readonly)
                    editorReadonly = true;
                if (controller && noproject)
                    noDefaultProject = true;
                if (layout) {
                    switch (layout[1].toLowerCase()) {
                        case "widget":
                            layoutType = EditorLayoutType.Widget;
                            break;
                        case "sandbox":
                            layoutType = EditorLayoutType.Sandbox;
                            break;
                        case "ide":
                            layoutType = EditorLayoutType.IDE;
                            break;
                    }
                }
            }
            pxt.debug(`shell: layout type ${EditorLayoutType[layoutType]}, readonly ${isReadOnly()}`);
        }
        function layoutTypeClass() {
            init();
            return pxt.shell.EditorLayoutType[layoutType].toLowerCase();
        }
        shell.layoutTypeClass = layoutTypeClass;
        function isSandboxMode() {
            init();
            return layoutType == EditorLayoutType.Sandbox;
        }
        shell.isSandboxMode = isSandboxMode;
        function isReadOnly() {
            return (!pxt.BrowserUtils.hasWindow() || (isSandboxMode()
                && !/[?&]edit=1/i.test(window.location.href)) ||
                (isControllerMode() && editorReadonly));
        }
        shell.isReadOnly = isReadOnly;
        function isNoProject() {
            return noDefaultProject;
        }
        shell.isNoProject = isNoProject;
        function isControllerMode() {
            init();
            return layoutType == EditorLayoutType.Controller;
        }
        shell.isControllerMode = isControllerMode;
        function isPyLangPref() {
            return pxt.storage.getLocal("editorlangpref") == "py";
        }
        shell.isPyLangPref = isPyLangPref;
        function getEditorLanguagePref() {
            return pxt.storage.getLocal("editorlangpref");
        }
        shell.getEditorLanguagePref = getEditorLanguagePref;
        function setEditorLanguagePref(lang) {
            if (lang.match(/prj$/))
                lang = lang.replace(/prj$/, "");
            pxt.storage.setLocal("editorlangpref", lang);
        }
        shell.setEditorLanguagePref = setEditorLanguagePref;
        function getToolboxAnimation() {
            return pxt.storage.getLocal("toolboxanimation");
        }
        shell.getToolboxAnimation = getToolboxAnimation;
        function setToolboxAnimation() {
            pxt.storage.setLocal("toolboxanimation", "1");
        }
        shell.setToolboxAnimation = setToolboxAnimation;
    })(shell = pxt.shell || (pxt.shell = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var skillmap;
    (function (skillmap) {
        skillmap.USER_VERSION = "0.0.1";
        class IndexedDBWorkspace {
            constructor() {
                this.db = new pxt.BrowserUtils.IDBWrapper(IndexedDBWorkspace.databaseName, IndexedDBWorkspace.version, (ev, result) => {
                    const db = result.result;
                    if (ev.oldVersion < 1) {
                        db.createObjectStore(IndexedDBWorkspace.projectTable, { keyPath: IndexedDBWorkspace.projectKey });
                        db.createObjectStore(IndexedDBWorkspace.userTable, { keyPath: IndexedDBWorkspace.userKey });
                    }
                });
            }
            initAsync() {
                return this.db.openAsync();
            }
            getAllProjectsAsync() {
                return this.db.getAllAsync(IndexedDBWorkspace.projectTable)
                    .then(entries => entries.map(e => e.project).filter(e => !e.deleted));
            }
            deleteProjectAsync(headerId) {
                return this.getProjectAsync(headerId)
                    .then(project => {
                    project.deleted = true;
                    this.saveProjectAsync(project);
                });
            }
            getProjectAsync(headerId) {
                return this.db.getAsync(IndexedDBWorkspace.projectTable, headerId)
                    .then(entry => { var _a; return (_a = entry) === null || _a === void 0 ? void 0 : _a.project; });
            }
            saveProjectAsync(project) {
                return this.db.setAsync(IndexedDBWorkspace.projectTable, {
                    id: project.header.id,
                    project
                });
            }
            getUserStateAsync() {
                return this.db.getAsync(IndexedDBWorkspace.userTable, "local-user")
                    .then(entry => { var _a; return (_a = entry) === null || _a === void 0 ? void 0 : _a.user; });
            }
            saveUserStateAsync(user) {
                return this.db.setAsync(IndexedDBWorkspace.userTable, {
                    id: "local-user",
                    user
                });
            }
        }
        IndexedDBWorkspace.version = 6;
        IndexedDBWorkspace.databaseName = "local-skill-map";
        IndexedDBWorkspace.projectTable = "projects";
        IndexedDBWorkspace.projectKey = "id";
        IndexedDBWorkspace.userTable = "users";
        IndexedDBWorkspace.userKey = "id";
        skillmap.IndexedDBWorkspace = IndexedDBWorkspace;
    })(skillmap = pxt.skillmap || (pxt.skillmap = {}));
})(pxt || (pxt = {}));
// See https://github.com/microsoft/TouchDevelop-backend/blob/master/docs/streams.md
var pxt;
(function (pxt) {
    var streams;
    (function (streams) {
        function createStreamAsync(target, name) {
            return pxt.Cloud.privatePostAsync("streams", { target: target, name: name || 'data' }).then(j => j);
        }
        streams.createStreamAsync = createStreamAsync;
        function postPayloadAsync(stream, data) {
            pxt.Util.assert(!!stream.privatekey);
            return pxt.Cloud.privatePostAsync(`${stream.id}/data?privatekey=${stream.privatekey}`, data);
        }
        streams.postPayloadAsync = postPayloadAsync;
    })(streams = pxt.streams || (pxt.streams = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var svgUtil;
    (function (svgUtil) {
        let PatternUnits;
        (function (PatternUnits) {
            PatternUnits[PatternUnits["userSpaceOnUse"] = 0] = "userSpaceOnUse";
            PatternUnits[PatternUnits["objectBoundingBox"] = 1] = "objectBoundingBox";
        })(PatternUnits = svgUtil.PatternUnits || (svgUtil.PatternUnits = {}));
        let LengthUnit;
        (function (LengthUnit) {
            LengthUnit[LengthUnit["em"] = 0] = "em";
            LengthUnit[LengthUnit["ex"] = 1] = "ex";
            LengthUnit[LengthUnit["px"] = 2] = "px";
            LengthUnit[LengthUnit["in"] = 3] = "in";
            LengthUnit[LengthUnit["cm"] = 4] = "cm";
            LengthUnit[LengthUnit["mm"] = 5] = "mm";
            LengthUnit[LengthUnit["pt"] = 6] = "pt";
            LengthUnit[LengthUnit["pc"] = 7] = "pc";
            LengthUnit[LengthUnit["percent"] = 8] = "percent";
        })(LengthUnit = svgUtil.LengthUnit || (svgUtil.LengthUnit = {}));
        const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
        class BaseElement {
            constructor(type) {
                this.el = elt(type);
            }
            attr(attributes) {
                Object.keys(attributes).forEach(at => {
                    this.setAttribute(at, attributes[at]);
                });
                return this;
            }
            setAttribute(name, value) {
                this.el.setAttribute(name, value.toString());
                return this;
            }
            setAttributeNS(ns, name, value) {
                this.el.setAttributeNS(ns, name, value.toString());
                return this;
            }
            id(id) {
                return this.setAttribute("id", id);
            }
            setClass(...classes) {
                return this.setAttribute("class", classes.join(" "));
            }
            appendClass(className) {
                pxt.BrowserUtils.addClass(this.el, className);
                return this;
            }
            removeClass(className) {
                pxt.BrowserUtils.removeClass(this.el, className);
            }
            title(text) {
                if (!this.titleElement) {
                    this.titleElement = elt("title");
                    // Title has to be the first child in the DOM
                    if (this.el.firstChild) {
                        this.el.insertBefore(this.titleElement, this.el.firstChild);
                    }
                    else {
                        this.el.appendChild(this.titleElement);
                    }
                }
                this.titleElement.textContent = text;
            }
            setVisible(visible) {
                return this.setAttribute("visibility", visible ? "visible" : "hidden");
            }
        }
        svgUtil.BaseElement = BaseElement;
        class DrawContext extends BaseElement {
            draw(type) {
                const el = drawable(type /*FIXME?*/);
                this.el.appendChild(el.el);
                return el;
            }
            element(type, cb) {
                cb(this.draw(type /*FIXME?*/));
                return this;
            }
            group() {
                const g = new Group();
                this.el.appendChild(g.el);
                return g;
            }
            appendChild(child) {
                this.el.appendChild(child.el);
            }
            onDown(handler) {
                svgUtil.events.down(this.el, handler);
                return this;
            }
            onUp(handler) {
                svgUtil.events.up(this.el, handler);
                return this;
            }
            onMove(handler) {
                svgUtil.events.move(this.el, handler);
                return this;
            }
            onEnter(handler) {
                svgUtil.events.enter(this.el, handler);
                return this;
            }
            onLeave(handler) {
                svgUtil.events.leave(this.el, handler);
                return this;
            }
            onClick(handler) {
                svgUtil.events.click(this.el, handler);
                return this;
            }
        }
        svgUtil.DrawContext = DrawContext;
        class SVG extends DrawContext {
            constructor(parent) {
                super("svg");
                if (parent) {
                    parent.appendChild(this.el);
                }
            }
            define(cb) {
                if (!this.defs) {
                    this.defs = new DefsElement(this.el);
                }
                cb(this.defs);
                return this;
            }
        }
        svgUtil.SVG = SVG;
        class Group extends DrawContext {
            constructor(parent) {
                super("g");
                if (parent) {
                    parent.appendChild(this.el);
                }
            }
            translate(x, y) {
                this.left = x;
                this.top = y;
                return this.updateTransform();
            }
            scale(factor) {
                this.scaleFactor = factor;
                return this.updateTransform();
            }
            def() {
                return new DefsElement(this.el);
            }
            style() {
                return new StyleElement(this.el);
            }
            updateTransform() {
                let transform = "";
                if (this.left != undefined) {
                    transform += `translate(${this.left} ${this.top})`;
                }
                if (this.scaleFactor != undefined) {
                    transform += ` scale(${this.scaleFactor})`;
                }
                this.setAttribute("transform", transform);
                return this;
            }
        }
        svgUtil.Group = Group;
        class Pattern extends DrawContext {
            constructor() {
                super("pattern");
            }
            units(kind) {
                return this.setAttribute("patternUnits", kind === PatternUnits.objectBoundingBox ? "objectBoundingBox" : "userSpaceOnUse");
            }
            contentUnits(kind) {
                return this.setAttribute("patternContentUnits", kind === PatternUnits.objectBoundingBox ? "objectBoundingBox" : "userSpaceOnUse");
            }
            size(width, height) {
                this.setAttribute("width", width);
                this.setAttribute("height", height);
                return this;
            }
        }
        svgUtil.Pattern = Pattern;
        class DefsElement extends BaseElement {
            constructor(parent) {
                super("defs");
                parent.appendChild(this.el);
            }
            create(type, id) {
                let el;
                switch (type) {
                    case "path":
                        el = new Path();
                        break;
                    case "pattern":
                        el = new Pattern();
                        break;
                    case "radialGradient":
                        el = new RadialGradient();
                        break;
                    case "linearGradient":
                        el = new LinearGradient();
                        break;
                    case "clipPath":
                        el = new ClipPath();
                        break;
                    default: el = new BaseElement(type);
                }
                el.id(id);
                this.el.appendChild(el.el);
                return el;
            }
        }
        svgUtil.DefsElement = DefsElement;
        class StyleElement extends BaseElement {
            constructor(parent) {
                super("style");
                parent.appendChild(this.el);
            }
            content(css) {
                this.el.textContent = css;
            }
        }
        svgUtil.StyleElement = StyleElement;
        class Drawable extends DrawContext {
            at(x, y) {
                this.setAttribute("x", x);
                this.setAttribute("y", y);
                return this;
            }
            moveTo(x, y) {
                return this.at(x, y);
            }
            fill(color, opacity) {
                this.setAttribute("fill", color);
                if (opacity != undefined) {
                    this.opacity(opacity);
                }
                return this;
            }
            opacity(opacity) {
                return this.setAttribute("fill-opacity", opacity);
            }
            stroke(color, width) {
                this.setAttribute("stroke", color);
                if (width != undefined) {
                    this.strokeWidth(width);
                }
                return this;
            }
            strokeWidth(width) {
                return this.setAttribute("stroke-width", width);
            }
            strokeOpacity(opacity) {
                return this.setAttribute("stroke-opacity", opacity);
            }
            clipPath(url) {
                return this.setAttribute("clip-path", url);
            }
        }
        svgUtil.Drawable = Drawable;
        class Text extends Drawable {
            constructor(text) {
                super("text");
                if (text != undefined) {
                    this.text(text);
                }
            }
            text(text) {
                this.el.textContent = text;
                return this;
            }
            fontFamily(family) {
                return this.setAttribute("font-family", family);
            }
            fontSize(size, units) {
                return this.setAttribute("font-size", lengthWithUnits(size, units));
            }
            offset(dx, dy, units) {
                if (dx !== 0) {
                    this.setAttribute("dx", lengthWithUnits(dx, units));
                }
                if (dy !== 0) {
                    this.setAttribute("dy", lengthWithUnits(dy, units));
                }
                return this;
            }
            anchor(type) {
                return this.setAttribute("text-anchor", type);
            }
        }
        svgUtil.Text = Text;
        class Rect extends Drawable {
            constructor() { super("rect"); }
            ;
            width(width, unit = LengthUnit.px) {
                return this.setAttribute("width", lengthWithUnits(width, unit));
            }
            height(height, unit = LengthUnit.px) {
                return this.setAttribute("height", lengthWithUnits(height, unit));
            }
            corner(radius) {
                return this.corners(radius, radius);
            }
            corners(rx, ry) {
                this.setAttribute("rx", rx);
                this.setAttribute("ry", ry);
                return this;
            }
            size(width, height, unit = LengthUnit.px) {
                this.width(width, unit);
                this.height(height, unit);
                return this;
            }
        }
        svgUtil.Rect = Rect;
        class Circle extends Drawable {
            constructor() { super("circle"); }
            at(cx, cy) {
                this.setAttribute("cx", cx);
                this.setAttribute("cy", cy);
                return this;
            }
            radius(r) {
                return this.setAttribute("r", r);
            }
        }
        svgUtil.Circle = Circle;
        class Ellipse extends Drawable {
            constructor() { super("ellipse"); }
            at(cx, cy) {
                this.setAttribute("cx", cx);
                this.setAttribute("cy", cy);
                return this;
            }
            radius(rx, ry) {
                this.setAttribute("rx", rx);
                this.setAttribute("ry", ry);
                return this;
            }
        }
        class Line extends Drawable {
            constructor() { super("line"); }
            at(x1, y1, x2, y2) {
                this.from(x1, y1);
                if (x2 != undefined && y2 != undefined) {
                    this.to(x2, y2);
                }
                return this;
            }
            from(x1, y1) {
                this.setAttribute("x1", x1);
                this.setAttribute("y1", y1);
                return this;
            }
            to(x2, y2) {
                this.setAttribute("x2", x2);
                this.setAttribute("y2", y2);
                return this;
            }
        }
        svgUtil.Line = Line;
        class PolyElement extends Drawable {
            points(points) {
                return this.setAttribute("points", points);
            }
            with(points) {
                return this.points(points.map(({ x, y }) => x + " " + y).join(","));
            }
        }
        svgUtil.PolyElement = PolyElement;
        class Polyline extends PolyElement {
            constructor() { super("polyline"); }
        }
        svgUtil.Polyline = Polyline;
        class Polygon extends PolyElement {
            constructor() { super("polygon"); }
        }
        svgUtil.Polygon = Polygon;
        class Path extends Drawable {
            constructor() {
                super("path");
                this.d = new PathContext();
            }
            update() {
                return this.setAttribute("d", this.d.toAttribute());
            }
            path(cb) {
                cb(this.d);
                return this.update();
            }
        }
        svgUtil.Path = Path;
        class Image extends Drawable {
            constructor() { super("image"); }
            src(url) {
                return this.setAttributeNS(XLINK_NAMESPACE, "href", url);
            }
            width(width, unit = LengthUnit.px) {
                return this.setAttribute("width", lengthWithUnits(width, unit));
            }
            height(height, unit = LengthUnit.px) {
                return this.setAttribute("height", lengthWithUnits(height, unit));
            }
            size(width, height, unit = LengthUnit.px) {
                this.width(width, unit);
                this.height(height, unit);
                return this;
            }
        }
        svgUtil.Image = Image;
        class Gradient extends BaseElement {
            units(kind) {
                return this.setAttribute("gradientUnits", kind === PatternUnits.objectBoundingBox ? "objectBoundingBox" : "userSpaceOnUse");
            }
            stop(offset, color, opacity) {
                const s = elt("stop");
                s.setAttribute("offset", offset + "%");
                if (color != undefined) {
                    s.setAttribute("stop-color", color);
                }
                if (opacity != undefined) {
                    s.setAttribute("stop-opacity", opacity);
                }
                this.el.appendChild(s);
                return this;
            }
        }
        svgUtil.Gradient = Gradient;
        class LinearGradient extends Gradient {
            constructor() { super("linearGradient"); }
            start(x1, y1) {
                this.setAttribute("x1", x1);
                this.setAttribute("y1", y1);
                return this;
            }
            end(x2, y2) {
                this.setAttribute("x2", x2);
                this.setAttribute("y2", y2);
                return this;
            }
        }
        svgUtil.LinearGradient = LinearGradient;
        class RadialGradient extends Gradient {
            constructor() { super("radialGradient"); }
            center(cx, cy) {
                this.setAttribute("cx", cx);
                this.setAttribute("cy", cy);
                return this;
            }
            focus(fx, fy, fr) {
                this.setAttribute("fx", fx);
                this.setAttribute("fy", fy);
                this.setAttribute("fr", fr);
                return this;
            }
            radius(r) {
                return this.setAttribute("r", r);
            }
        }
        svgUtil.RadialGradient = RadialGradient;
        class ClipPath extends DrawContext {
            constructor() { super("clipPath"); }
            clipPathUnits(objectBoundingBox) {
                if (objectBoundingBox) {
                    return this.setAttribute("clipPathUnits", "objectBoundingBox");
                }
                else {
                    return this.setAttribute("clipPathUnits", "userSpaceOnUse");
                }
            }
        }
        svgUtil.ClipPath = ClipPath;
        function elt(type) {
            let el = document.createElementNS("http://www.w3.org/2000/svg", type);
            return el;
        }
        function drawable(type) {
            switch (type) {
                case "text": return new Text();
                case "circle": return new Circle();
                case "rect": return new Rect();
                case "line": return new Line();
                case "polygon": return new Polygon();
                case "polyline": return new Polyline();
                case "path": return new Path();
                default: return new Drawable(type);
            }
        }
        class PathContext {
            constructor() {
                this.ops = [];
            }
            clear() {
                this.ops = [];
            }
            moveTo(x, y) {
                return this.op("M", x, y);
            }
            moveBy(dx, dy) {
                return this.op("m", dx, dy);
            }
            lineTo(x, y) {
                return this.op("L", x, y);
            }
            lineBy(dx, dy) {
                return this.op("l", dx, dy);
            }
            cCurveTo(c1x, c1y, c2x, c2y, x, y) {
                return this.op("C", c1x, c1y, c2x, c2y, x, y);
            }
            cCurveBy(dc1x, dc1y, dc2x, dc2y, dx, dy) {
                return this.op("c", dc1x, dc1y, dc2x, dc2y, dx, dy);
            }
            qCurveTo(cx, cy, x, y) {
                return this.op("Q", cx, cy, x, y);
            }
            qCurveBy(dcx, dcy, dx, dy) {
                return this.op("q", dcx, dcy, dx, dy);
            }
            sCurveTo(cx, cy, x, y) {
                return this.op("S", cx, cy, x, y);
            }
            sCurveBy(dcx, dcy, dx, dy) {
                return this.op("s", dcx, dcy, dx, dy);
            }
            tCurveTo(x, y) {
                return this.op("T", x, y);
            }
            tCurveBy(dx, dy) {
                return this.op("t", dx, dy);
            }
            arcTo(rx, ry, xRotate, large, sweepClockwise, x, y) {
                return this.op("A", rx, ry, xRotate, large ? 1 : 0, sweepClockwise ? 1 : 0, x, y);
            }
            arcBy(rx, ry, xRotate, large, sweepClockwise, x, y) {
                return this.op("a", rx, ry, xRotate, large ? 1 : 0, sweepClockwise ? 1 : 0, x, y);
            }
            close() {
                return this.op("z");
            }
            toAttribute() {
                return this.ops.map(op => op.op + " " + op.args.join(" ")).join(" ");
            }
            op(op, ...args) {
                this.ops.push({
                    op,
                    args
                });
                return this;
            }
        }
        svgUtil.PathContext = PathContext;
        function lengthWithUnits(value, unit) {
            switch (unit) {
                case LengthUnit.em: return value + "em";
                case LengthUnit.ex: return value + "ex";
                case LengthUnit.px: return value + "px";
                case LengthUnit.in: return value + "in";
                case LengthUnit.cm: return value + "cm";
                case LengthUnit.mm: return value + "mm";
                case LengthUnit.pt: return value + "pt";
                case LengthUnit.pc: return value + "pc";
                case LengthUnit.percent: return value + "%";
                default: return value.toString();
            }
        }
    })(svgUtil = pxt.svgUtil || (pxt.svgUtil = {}));
})(pxt || (pxt = {}));
(function (pxt) {
    var svgUtil;
    (function (svgUtil) {
        var events;
        (function (events) {
            function isTouchEnabled() {
                return typeof window !== "undefined" &&
                    ('ontouchstart' in window // works on most browsers
                        || (navigator && navigator.maxTouchPoints > 0)); // works on IE10/11 and Surface);
            }
            events.isTouchEnabled = isTouchEnabled;
            function hasPointerEvents() {
                return typeof window != "undefined" && !!window.PointerEvent;
            }
            events.hasPointerEvents = hasPointerEvents;
            function down(el, handler) {
                if (hasPointerEvents()) {
                    el.addEventListener("pointerdown", handler);
                }
                else if (isTouchEnabled()) {
                    el.addEventListener("mousedown", handler);
                    el.addEventListener("touchstart", handler);
                }
                else {
                    el.addEventListener("mousedown", handler);
                }
            }
            events.down = down;
            function up(el, handler) {
                if (hasPointerEvents()) {
                    el.addEventListener("pointerup", handler);
                }
                else if (isTouchEnabled()) {
                    el.addEventListener("mouseup", handler);
                }
                else {
                    el.addEventListener("mouseup", handler);
                }
            }
            events.up = up;
            function enter(el, handler) {
                if (hasPointerEvents()) {
                    el.addEventListener("pointerover", e => {
                        handler(!!(e.buttons & 1));
                    });
                }
                else if (isTouchEnabled()) {
                    el.addEventListener("touchstart", e => {
                        handler(true);
                    });
                }
                else {
                    el.addEventListener("mouseover", e => {
                        handler(!!(e.buttons & 1));
                    });
                }
            }
            events.enter = enter;
            function leave(el, handler) {
                if (hasPointerEvents()) {
                    el.addEventListener("pointerleave", handler);
                }
                else if (isTouchEnabled()) {
                    el.addEventListener("touchend", handler);
                }
                else {
                    el.addEventListener("mouseleave", handler);
                }
            }
            events.leave = leave;
            function move(el, handler) {
                if (hasPointerEvents()) {
                    el.addEventListener("pointermove", handler);
                }
                else if (isTouchEnabled()) {
                    el.addEventListener("touchmove", handler);
                }
                else {
                    el.addEventListener("mousemove", handler);
                }
            }
            events.move = move;
            function click(el, handler) {
                el.addEventListener("click", handler);
            }
            events.click = click;
        })(events = svgUtil.events || (svgUtil.events = {}));
    })(svgUtil = pxt.svgUtil || (pxt.svgUtil = {}));
})(pxt || (pxt = {}));
(function (pxt) {
    var svgUtil;
    (function (svgUtil) {
        var helpers;
        (function (helpers) {
            class CenteredText extends svgUtil.Text {
                at(cx, cy) {
                    this.cx = cx;
                    this.cy = cy;
                    this.rePosition();
                    return this;
                }
                text(text, fontSizePixels = 12) {
                    super.text(text);
                    this.fontSizePixels = fontSizePixels;
                    this.setAttribute("font-size", fontSizePixels + "px");
                    this.rePosition();
                    return this;
                }
                rePosition() {
                    if (this.cx == undefined || this.cy == undefined || this.fontSizePixels == undefined) {
                        return;
                    }
                    this.setAttribute("x", this.cx);
                    this.setAttribute("y", this.cy);
                    this.setAttribute("text-anchor", "middle");
                    this.setAttribute("alignment-baseline", "middle");
                }
            }
            helpers.CenteredText = CenteredText;
        })(helpers = svgUtil.helpers || (svgUtil.helpers = {}));
    })(svgUtil = pxt.svgUtil || (pxt.svgUtil = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    pxt.IMAGE_MIME_TYPE = "image/x-mkcd-f4";
    pxt.TILEMAP_MIME_TYPE = "application/mkcd-tilemap";
    pxt.ANIMATION_MIME_TYPE = "application/mkcd-animation";
    class AssetCollection {
        constructor() {
            this.assets = [];
            this.takenNames = {};
            this.listeners = [];
        }
        add(asset) {
            if (this.takenNames[asset.id]) {
                return this.update(asset.id, asset);
            }
            else {
                const clone = cloneAsset(asset);
                this.takenNames[clone.id] = true;
                this.takenNames[getShortIDForAsset(clone)] = true;
                if (clone.meta.displayName && clone.meta.displayName !== clone.id) {
                    if (this.takenNames[clone.meta.displayName]) {
                        clone.meta.displayName = this.generateNewDisplayName(clone.meta.displayName);
                    }
                    this.takenNames[clone.meta.displayName] = true;
                }
                this.assets.push(clone);
                return cloneAsset(clone);
            }
        }
        getSnapshot(filter) {
            if (filter) {
                return this.assets.filter(a => filter(a)).map(cloneAsset);
            }
            return this.assets.map(cloneAsset);
        }
        update(id, newValue) {
            let asset;
            if (this.takenNames[id]) {
                const existing = this.lookupByID(id);
                if (!assetEquals(existing, newValue)) {
                    this.removeByID(id);
                    asset = this.add(newValue);
                    this.notifyListener(newValue.internalID);
                }
                else {
                    asset = newValue;
                }
            }
            else {
                asset = this.add(newValue);
            }
            return asset;
        }
        removeByID(id) {
            const existing = this.lookupByID(id);
            this.assets = this.assets.filter(a => a.id !== id);
            delete this.takenNames[id];
            if (existing) {
                delete this.takenNames[getShortIDForAsset(existing)];
            }
            if (existing === null || existing === void 0 ? void 0 : existing.meta.displayName) {
                delete this.takenNames[existing === null || existing === void 0 ? void 0 : existing.meta.displayName];
            }
        }
        getByID(id) {
            const asset = this.lookupByID(id);
            return asset && cloneAsset(asset);
        }
        getByDisplayName(name) {
            if (this.takenNames[name]) {
                for (const asset of this.assets) {
                    if (asset.meta.displayName === name || getShortIDForAsset(asset) === name) {
                        return cloneAsset(asset);
                    }
                }
            }
            return undefined;
        }
        isIDTaken(id) {
            return !!this.takenNames[id];
        }
        clone() {
            const cloned = new AssetCollection();
            cloned.assets = this.getSnapshot();
            cloned.takenNames = Object.assign({}, this.takenNames);
            return cloned;
        }
        serializeToJRes(allJRes = {}) {
            for (const asset of this.assets) {
                addAssetToJRes(asset, allJRes);
            }
            return allJRes;
        }
        addListener(internalID, listener) {
            this.listeners.push({ internalID, callback: listener });
        }
        removeListener(listener) {
            this.listeners = this.listeners.filter(ref => ref.callback !== listener);
        }
        diff(past) {
            let diff = {
                before: [],
                after: []
            };
            let handled = {};
            for (const pastAsset of past.assets) {
                handled[pastAsset.internalID] = true;
                const futureAsset = this.lookupByInternalID(pastAsset.internalID);
                if (!futureAsset || !assetEquals(pastAsset, futureAsset)) {
                    diff.before.push(pastAsset);
                    diff.after.push(futureAsset);
                }
            }
            for (const futureAsset of this.assets.filter(a => !handled[a.internalID])) {
                diff.before.push(null);
                diff.after.push(futureAsset);
            }
            return diff;
        }
        applyDiff(diff, backwards = false) {
            const before = backwards ? diff.after : diff.before;
            const after = backwards ? diff.before : diff.after;
            pxt.Util.assert(before.length === after.length);
            for (let i = 0; i < before.length; i++) {
                if (!before[i]) {
                    this.assets.push(after[i]);
                    this.notifyListener(after[i].internalID);
                    continue;
                }
                this.removeByInternalID(before[i].internalID);
                if (after[i]) {
                    this.assets.push(after[i]);
                }
                this.notifyListener(before[i].internalID);
            }
            this.takenNames = {};
            for (const asset of this.assets) {
                pxt.Util.assert(!this.takenNames[asset.id]);
                this.takenNames[asset.id] = true;
                this.takenNames[getShortIDForAsset(asset)] = true;
                if (asset.meta.displayName) {
                    if (asset.meta.displayName !== asset.id)
                        pxt.Util.assert(!this.takenNames[asset.meta.displayName]);
                    this.takenNames[asset.meta.displayName] = true;
                }
            }
        }
        lookupByID(id) {
            for (const asset of this.assets) {
                if (asset.id === id) {
                    return asset;
                }
            }
            return null;
        }
        lookupByInternalID(id) {
            for (const asset of this.assets) {
                if (asset.internalID === id) {
                    return asset;
                }
            }
            return null;
        }
        removeByInternalID(id) {
            this.assets = this.assets.filter(a => a.internalID !== id);
        }
        notifyListener(internalID) {
            for (const listener of this.listeners) {
                if (listener.internalID === internalID)
                    listener.callback();
            }
        }
        generateNewDisplayName(prefix) {
            prefix = prefix.replace(/\d+$/, "");
            let index = 0;
            while (this.takenNames[prefix + index]) {
                ++index;
            }
            return prefix + index;
        }
    }
    class TilemapProject {
        constructor() {
            this.needsRebuild = true;
            this.nextID = 0;
            this.nextInternalID = 0;
            this.committedState = {
                revision: 0,
                tilemaps: new AssetCollection(),
                tiles: new AssetCollection(),
                animations: new AssetCollection(),
                images: new AssetCollection()
            };
            this.state = {
                revision: this.nextID++,
                tilemaps: new AssetCollection(),
                tiles: new AssetCollection(),
                animations: new AssetCollection(),
                images: new AssetCollection()
            };
            this.gallery = {
                revision: 0,
                tilemaps: new AssetCollection(),
                tiles: new AssetCollection(),
                animations: new AssetCollection(),
                images: new AssetCollection()
            };
            this.undoStack = [];
            this.redoStack = [];
        }
        getNewInternalId() {
            return this.nextInternalID++;
        }
        createNewImage(width = 16, height = 16) {
            const id = this.generateNewID("image" /* Image */);
            const bitmap = new pxt.sprite.Bitmap(width, height).data();
            const newImage = {
                internalID: this.getNewInternalId(),
                id,
                type: "image" /* Image */,
                bitmap: bitmap,
                meta: {},
                jresData: pxt.sprite.base64EncodeBitmap(bitmap)
            };
            return this.state.images.add(newImage);
        }
        createNewAnimation(width = 16, height = 16) {
            const id = this.generateNewID("animation" /* Animation */);
            const bitmap = new pxt.sprite.Bitmap(width, height).data();
            const newAnimation = {
                internalID: this.getNewInternalId(),
                id,
                type: "animation" /* Animation */,
                frames: [bitmap],
                interval: 500,
                meta: {},
            };
            return this.state.animations.add(newAnimation);
        }
        createNewAnimationFromData(frames, interval = 500, displayName) {
            const id = this.generateNewID("animation" /* Animation */);
            const newAnimation = {
                internalID: this.getNewInternalId(),
                id,
                type: "animation" /* Animation */,
                frames,
                interval,
                meta: { displayName },
            };
            return this.state.animations.add(newAnimation);
        }
        getGalleryTiles(tileWidth) {
            if (this.extensionTileSets) {
                return this.extensionTileSets.map(collection => collection.tileSets.find(tileSet => tileSet.tileWidth === tileWidth)).filter(tileSet => tileSet === null || tileSet === void 0 ? void 0 : tileSet.tiles.length);
            }
            return null;
        }
        getProjectImages() {
            return this.state.images.getSnapshot();
        }
        getProjectTiles(tileWidth, createIfMissing) {
            const tiles = this.state.tiles.getSnapshot(tile => tile.bitmap.width === tileWidth);
            if (tiles.length === 0) {
                if (createIfMissing) {
                    // This will create a new tileset with the correct width
                    this.createNewTile(new pxt.sprite.Bitmap(tileWidth, tileWidth).data());
                    return this.getProjectTiles(tileWidth, false);
                }
                return null;
            }
            return {
                tileWidth,
                tiles
            };
        }
        createNewTile(data, id, displayName) {
            this.onChange();
            if (!id || this.isNameTaken("tile" /* Tile */, id)) {
                id = this.generateNewID("tile" /* Tile */);
            }
            const newTile = {
                internalID: this.getNewInternalId(),
                id,
                type: "tile" /* Tile */,
                jresData: pxt.sprite.base64EncodeBitmap(data),
                bitmap: data,
                meta: {
                    displayName
                },
                isProjectTile: true
            };
            return this.state.tiles.add(newTile);
        }
        createNewProjectImage(data, displayName) {
            this.onChange();
            const newImage = {
                internalID: this.getNewInternalId(),
                id: this.generateNewID("image" /* Image */),
                type: "image" /* Image */,
                jresData: pxt.sprite.base64EncodeBitmap(data),
                meta: {
                    displayName
                },
                bitmap: data
            };
            return this.state.images.add(newImage);
        }
        updateTile(tile) {
            this.onChange();
            const existing = this.resolveProjectTileByInternalID(tile.internalID);
            if (existing) {
                this.state.tiles.update(existing.id, tile);
                if (existing.id !== tile.id || !pxt.sprite.bitmapEquals(existing.bitmap, tile.bitmap)) {
                    for (const tm of this.getAssets("tilemap" /* Tilemap */)) {
                        if (tm.data.tileset.tiles.some(t => t.internalID === tile.internalID)) {
                            tm.data.tileset.tiles = tm.data.tileset.tiles.map(t => t.internalID === tile.internalID ? tile : t);
                            this.updateTilemap(tm.id, tm.data);
                        }
                    }
                }
                return tile;
            }
            return null;
        }
        deleteTile(id) {
            this.onChange();
            this.state.tiles.removeByID(id);
        }
        getProjectTilesetJRes() {
            const blob = {};
            this.state.tiles.serializeToJRes(blob);
            this.state.tilemaps.serializeToJRes(blob);
            blob["*"] = {
                "mimeType": "image/x-mkcd-f4",
                "dataEncoding": "base64",
                "namespace": pxt.sprite.TILE_NAMESPACE
            };
            return blob;
        }
        getProjectAssetsJRes() {
            const blob = {};
            this.state.images.serializeToJRes(blob);
            this.state.animations.serializeToJRes(blob);
            blob["*"] = {
                "mimeType": "image/x-mkcd-f4",
                "dataEncoding": "base64",
                "namespace": pxt.sprite.IMAGES_NAMESPACE
            };
            return blob;
        }
        getTilemap(id) {
            return this.state.tilemaps.getByID(id);
        }
        updateTilemap(id, data) {
            const existing = this.state.tilemaps.getByID(id);
            if (existing) {
                this.onChange();
                const newValue = Object.assign(Object.assign({}, existing), { data: data });
                this.state.tilemaps.update(id, newValue);
                return newValue;
            }
            return null;
        }
        createNewTilemap(name, tileWidth, width = 16, height = 16) {
            return this.createNewTilemapFromData(this.blankTilemap(tileWidth, width, height), name);
        }
        blankTilemap(tileWidth, width = 16, height = 16) {
            const tilemap = new pxt.sprite.Tilemap(width, height);
            const layers = new pxt.sprite.Bitmap(width, height);
            const tileset = {
                tileWidth,
                tiles: [this.getTransparency(tileWidth)]
            };
            return new pxt.sprite.TilemapData(tilemap, tileset, layers.data());
        }
        resolveTile(id) {
            return this.lookupAsset("tile" /* Tile */, id);
        }
        resolveProjectTileByInternalID(id) {
            return this.state.tiles.getSnapshot(tile => tile.internalID === id)[0];
        }
        resolveTileByBitmap(data) {
            const dataString = pxt.sprite.base64EncodeBitmap(data);
            return this.state.tiles.getSnapshot(tile => tile.jresData === dataString)[0];
        }
        getTransparency(tileWidth) {
            const id = pxt.sprite.TILE_NAMESPACE + ".transparency" + tileWidth;
            let tile = this.state.tiles.getByID(id);
            if (!tile) {
                const bitmap = new pxt.sprite.Bitmap(tileWidth, tileWidth).data();
                tile = {
                    internalID: this.getNewInternalId(),
                    id,
                    type: "tile" /* Tile */,
                    bitmap: bitmap,
                    jresData: pxt.sprite.base64EncodeBitmap(bitmap),
                    meta: {},
                    isProjectTile: true
                };
                return this.state.tiles.add(tile);
            }
            return tile;
        }
        createNewTilemapFromData(data, name) {
            this.onChange();
            const id = this.generateNewIDInternal("tilemap" /* Tilemap */, name || lf("level"));
            this.state.tilemaps.add({
                internalID: this.getNewInternalId(),
                id,
                type: "tilemap" /* Tilemap */,
                meta: {
                    displayName: id
                },
                data: data
            });
            return [id, data];
        }
        cloneState() {
            return {
                revision: this.state.revision,
                images: this.state.images.clone(),
                tilemaps: this.state.tilemaps.clone(),
                animations: this.state.animations.clone(),
                tiles: this.state.tiles.clone(),
            };
        }
        undo() {
            if (this.state.revision !== this.committedState.revision) {
                this.pushUndo();
            }
            if (this.undoStack.length) {
                const undo = this.undoStack.pop();
                this.state.tiles.applyDiff(undo.tiles, true);
                this.state.images.applyDiff(undo.images, true);
                this.state.tilemaps.applyDiff(undo.tilemaps, true);
                this.state.animations.applyDiff(undo.animations, true);
                this.state.revision = undo.beforeRevision;
                this.redoStack.push(undo);
                this.committedState = this.cloneState();
                this.needsRebuild = true;
            }
        }
        redo() {
            if (this.redoStack.length) {
                const redo = this.redoStack.pop();
                this.state.tiles.applyDiff(redo.tiles);
                this.state.images.applyDiff(redo.images);
                this.state.tilemaps.applyDiff(redo.tilemaps);
                this.state.animations.applyDiff(redo.animations);
                this.state.revision = redo.afterRevision;
                this.undoStack.push(redo);
                this.committedState = this.cloneState();
                this.needsRebuild = true;
            }
        }
        pushUndo() {
            if (this.undoStack.length && this.committedState.revision === this.state.revision)
                return;
            this.redoStack = [];
            this.undoStack.push({
                beforeRevision: this.committedState.revision,
                afterRevision: this.state.revision,
                tiles: this.state.tiles.diff(this.committedState.tiles),
                images: this.state.images.diff(this.committedState.images),
                tilemaps: this.state.tilemaps.diff(this.committedState.tilemaps),
                animations: this.state.animations.diff(this.committedState.animations)
            });
            this.committedState = this.cloneState();
            this.cleanupTemporaryAssets();
        }
        revision() {
            return this.state.revision;
        }
        encodeTilemap(tilemap, id) {
            const tm = tilemap.tilemap.data();
            const data = new Uint8ClampedArray(5 + tm.data.length + tilemap.layers.data.length);
            data[0] = tilemap.tileset.tileWidth;
            data[1] = tm.width & 0xff;
            data[2] = (tm.width >> 8) & 0xff;
            data[3] = tm.height & 0xff;
            data[4] = (tm.height >> 8) & 0xff;
            data.set(tm.data, 5);
            data.set(tilemap.layers.data, 5 + tm.data.length);
            return {
                id,
                mimeType: pxt.TILEMAP_MIME_TYPE,
                data: btoa(pxt.sprite.uint8ArrayToHex(data)),
                tileset: tilemap.tileset.tiles.map(t => t.id)
            };
        }
        forceUpdate() {
            this.onChange();
        }
        isNameTaken(assetType, name) {
            const isTaken = (id) => {
                switch (assetType) {
                    case "image" /* Image */:
                        return this.state.images.isIDTaken(id) || this.gallery.images.isIDTaken(id);
                    case "tile" /* Tile */:
                        return this.state.tiles.isIDTaken(id) || this.gallery.tiles.isIDTaken(id);
                    case "tilemap" /* Tilemap */:
                        return this.state.tilemaps.isIDTaken(id) || this.gallery.tilemaps.isIDTaken(id);
                    case "animation" /* Animation */:
                        return this.state.animations.isIDTaken(id) || this.gallery.animations.isIDTaken(id);
                }
            };
            const shortId = getShortIDCore(assetType, name);
            const checkShortId = shortId && shortId !== name;
            return isTaken(name) || (checkShortId && isTaken(shortId));
        }
        /**
         * Checks if the asset is referenced anywhere in the user's code.
         * If an asset is referenced in any block we return true, as well
         * as if a tile is used in any tilemap.
         *
         * Ways to reference an asset in TS/Python:
         *
         * TILES:
         * myTiles.shortId
         * assets.tile`shortId`
         * assets.tile`displayName`
         *
         * IMAGES:
         * assets.image`shortId`
         * assets.image`displayName`
         *
         * ANIMATIONS:
         * assets.animation`shortId`
         * assets.animation`displayName`
         *
         * TILEMAPS:
         * tilemap`shortId`
         *
         * @param skipIDs string[] a list of string ids (block id, asset id, or file name) to ignore
         **/
        isAssetUsed(asset, files, skipIDs) {
            var _a, _b, _c;
            let blockIds = ((_b = (_a = asset.meta) === null || _a === void 0 ? void 0 : _a.blockIDs) === null || _b === void 0 ? void 0 : _b.filter(id => !skipIDs || (skipIDs === null || skipIDs === void 0 ? void 0 : skipIDs.indexOf(id)) < 0)) || [];
            if (blockIds.length > 0)
                return true;
            if (asset.type == "tile" /* Tile */) {
                for (const tm of this.getAssets("tilemap" /* Tilemap */)) {
                    if ((skipIDs === null || skipIDs === void 0 ? void 0 : skipIDs.indexOf(tm.id)) >= 0) {
                        continue;
                    }
                    else if (tm.data.tileset.tiles.some(t => t.id === asset.id)) {
                        return true;
                    }
                }
            }
            if (files) {
                const shortId = pxt.Util.escapeForRegex(getShortIDForAsset(asset));
                const displayName = pxt.Util.escapeForRegex((_c = asset.meta) === null || _c === void 0 ? void 0 : _c.displayName) || "";
                let assetTsRefs;
                switch (asset.type) {
                    case "tile" /* Tile */:
                        assetTsRefs = `myTiles.${shortId}|assets.tile\`${shortId}\``;
                        if (displayName)
                            assetTsRefs += `|assets.tile\`${displayName}\``;
                        break;
                    case "tilemap" /* Tilemap */:
                        assetTsRefs = `tilemap\`${shortId}\``;
                        break;
                    case "animation" /* Animation */:
                        assetTsRefs = `assets.animation\`${shortId}\``;
                        if (displayName)
                            assetTsRefs += `|assets.animation\`${displayName}\``;
                        break;
                    default:
                        assetTsRefs = `assets.image\`${shortId}\``;
                        if (displayName)
                            assetTsRefs += `|assets.image\`${displayName}\``;
                        break;
                }
                const assetTsRegex = new RegExp(assetTsRefs, "gm");
                let assetPyRefs;
                switch (asset.type) {
                    case "tile" /* Tile */:
                        assetPyRefs = `myTiles.${shortId}|assets.tile\("""${shortId}"""\)`;
                        if (displayName)
                            assetPyRefs += `|assets.tile\("""${displayName}"""\)`;
                        break;
                    case "tilemap" /* Tilemap */:
                        assetPyRefs = `assets.tilemap\("""${shortId}"""\)`;
                        break;
                    case "animation" /* Animation */:
                        assetPyRefs = `assets.animation\("""${shortId}"""\)`;
                        if (displayName)
                            assetPyRefs += `|assets.animation\("""${displayName}"""\)`;
                        break;
                    default:
                        assetPyRefs = `assets.image\("""${shortId}"""\)`;
                        if (displayName)
                            assetPyRefs += `|assets.image\("""${displayName}"""\)`;
                        break;
                }
                const assetPyRegex = new RegExp(assetPyRefs, "gm");
                for (let filename of Object.keys(files)) {
                    if ((skipIDs === null || skipIDs === void 0 ? void 0 : skipIDs.indexOf(filename)) >= 0)
                        continue;
                    const f = files[filename];
                    // Match .ts files that are not generated (.g.ts)
                    if (filename.match(/((?!\.g).{2}|^.{0,1})\.ts$/i)) {
                        if (f.content.match(assetTsRegex))
                            return true;
                    }
                    else if (filename.endsWith(".py")) {
                        if (f.content.match(assetPyRegex))
                            return true;
                    }
                }
            }
            return false;
        }
        lookupAsset(assetType, name) {
            switch (assetType) {
                case "image" /* Image */:
                    return this.state.images.getByID(name) || this.gallery.images.getByID(name);
                case "tile" /* Tile */:
                    return this.state.tiles.getByID(name) || this.gallery.tiles.getByID(name);
                case "tilemap" /* Tilemap */:
                    return this.state.tilemaps.getByID(name) || this.gallery.tilemaps.getByID(name);
                case "animation" /* Animation */:
                    return this.state.animations.getByID(name) || this.gallery.animations.getByID(name);
            }
        }
        lookupAssetByName(assetType, name) {
            switch (assetType) {
                case "image" /* Image */:
                    return this.state.images.getByDisplayName(name);
                case "tile" /* Tile */:
                    return this.state.tiles.getByDisplayName(name);
                case "tilemap" /* Tilemap */:
                    return this.state.tilemaps.getByDisplayName(name);
                case "animation" /* Animation */:
                    return this.state.animations.getByDisplayName(name);
            }
        }
        getAssets(type) {
            switch (type) {
                case "image" /* Image */: return this.state.images.getSnapshot();
                case "tile" /* Tile */: return this.state.tiles.getSnapshot();
                case "tilemap" /* Tilemap */: return this.state.tilemaps.getSnapshot();
                case "animation" /* Animation */: return this.state.animations.getSnapshot();
            }
        }
        getGalleryAssets(type) {
            switch (type) {
                case "image" /* Image */: return this.gallery.images.getSnapshot();
                case "tile" /* Tile */: return this.gallery.tiles.getSnapshot();
                case "tilemap" /* Tilemap */: return this.gallery.tilemaps.getSnapshot();
                case "animation" /* Animation */: return this.gallery.animations.getSnapshot();
            }
        }
        lookupBlockAsset(type, blockID) {
            let filter = (a) => { var _a, _b; return ((_b = (_a = a.meta) === null || _a === void 0 ? void 0 : _a.blockIDs) === null || _b === void 0 ? void 0 : _b.indexOf(blockID)) !== -1; };
            switch (type) {
                case "image" /* Image */: return this.state.images.getSnapshot(filter)[0];
                case "tile" /* Tile */: return this.state.tiles.getSnapshot(filter)[0];
                case "tilemap" /* Tilemap */: return this.state.tilemaps.getSnapshot(filter)[0];
                case "animation" /* Animation */: return this.state.animations.getSnapshot(filter)[0];
            }
        }
        updateAsset(asset) {
            this.onChange();
            switch (asset.type) {
                case "image" /* Image */:
                    return this.state.images.update(asset.id, asset);
                case "tile" /* Tile */:
                    return this.updateTile(asset);
                case "tilemap" /* Tilemap */:
                    return this.state.tilemaps.update(asset.id, asset);
                case "animation" /* Animation */:
                    return this.state.animations.update(asset.id, asset);
            }
        }
        duplicateAsset(asset) {
            var _a;
            this.onChange();
            const clone = cloneAsset(asset);
            const displayName = (_a = clone.meta) === null || _a === void 0 ? void 0 : _a.displayName;
            let newAsset;
            switch (asset.type) {
                case "image" /* Image */:
                    newAsset = this.createNewProjectImage(clone.bitmap, displayName);
                    break;
                case "tile" /* Tile */:
                    newAsset = this.createNewTile(clone.bitmap, null, displayName);
                    break;
                case "tilemap" /* Tilemap */:
                    const [id, tilemap] = this.createNewTilemapFromData(clone.data, displayName);
                    newAsset = this.getTilemap(id);
                    break;
                case "animation" /* Animation */:
                    newAsset = this.createNewAnimationFromData(clone.frames, clone.interval, displayName);
            }
            return newAsset;
        }
        removeAsset(asset) {
            this.onChange();
            switch (asset.type) {
                case "image" /* Image */:
                    return this.state.images.removeByID(asset.id);
                case "tile" /* Tile */:
                    return this.state.tiles.removeByID(asset.id);
                case "tilemap" /* Tilemap */:
                    return this.state.tilemaps.removeByID(asset.id);
                case "animation" /* Animation */:
                    return this.state.animations.removeByID(asset.id);
            }
        }
        addChangeListener(asset, listener) {
            switch (asset.type) {
                case "image" /* Image */:
                    this.state.images.addListener(asset.internalID, listener);
                    break;
                case "tile" /* Tile */:
                    this.state.tiles.addListener(asset.internalID, listener);
                    break;
                case "tilemap" /* Tilemap */:
                    this.state.tilemaps.addListener(asset.internalID, listener);
                    break;
                case "animation" /* Animation */:
                    this.state.animations.addListener(asset.internalID, listener);
                    break;
            }
        }
        removeChangeListener(type, listener) {
            switch (type) {
                case "image" /* Image */:
                    this.state.images.removeListener(listener);
                    break;
                case "tile" /* Tile */:
                    this.state.tiles.removeListener(listener);
                    break;
                case "tilemap" /* Tilemap */:
                    this.state.tilemaps.removeListener(listener);
                    break;
                case "animation" /* Animation */:
                    this.state.animations.removeListener(listener);
                    break;
            }
        }
        loadPackage(pack) {
            const allPackages = pack.sortedDeps();
            this.extensionTileSets = [];
            for (const dep of allPackages) {
                const isProject = dep.id === "this";
                const images = this.readImages(dep.parseJRes(), isProject);
                for (const image of images) {
                    if (image.type === "tile" /* Tile */) {
                        if (isProject) {
                            this.state.tiles.add(image);
                        }
                        else {
                            this.gallery.tiles.add(image);
                        }
                    }
                    else if (image.type === "image" /* Image */) {
                        if (isProject) {
                            this.state.images.add(image);
                        }
                        else {
                            this.gallery.images.add(image);
                        }
                    }
                    else {
                        if (isProject) {
                            this.state.animations.add(image);
                        }
                        else {
                            this.gallery.animations.add(image);
                        }
                    }
                }
            }
            for (const tm of getTilemaps(pack.parseJRes())) {
                this.state.tilemaps.add({
                    internalID: this.getNewInternalId(),
                    type: "tilemap" /* Tilemap */,
                    id: tm.id,
                    meta: {
                        // For tilemaps, use the id as the display name for backwards compat
                        displayName: tm.displayName || tm.id
                    },
                    data: decodeTilemap(tm, id => this.resolveTile(id))
                });
            }
            this.committedState = this.cloneState();
            this.undoStack = [];
            this.redoStack = [];
        }
        loadTilemapJRes(jres, skipDuplicates = false) {
            jres = pxt.inflateJRes(jres);
            const tiles = this.readImages(jres, true).filter(im => im.type === "tile" /* Tile */);
            // If we are loading JRES into an existing project (i.e. in multipart tutorials)
            // we need to correct the tile ids because the user may have created new tiles
            // and taken some of the ids that were used by the tutorial author
            let tileMapping = {};
            for (const tile of tiles) {
                if (skipDuplicates) {
                    const existing = this.resolveTileByBitmap(tile.bitmap);
                    if (existing) {
                        tileMapping[tile.id] = existing.id;
                        continue;
                    }
                }
                const newTile = this.createNewTile(tile.bitmap, tile.id, tile.meta.displayName);
                if (newTile.id !== tile.id) {
                    tileMapping[tile.id] = newTile.id;
                }
            }
            for (const tm of getTilemaps(jres)) {
                this.state.tilemaps.add({
                    internalID: this.getNewInternalId(),
                    type: "tilemap" /* Tilemap */,
                    id: tm.id,
                    meta: {
                        // For tilemaps, use the id as the display name for backwards compat
                        displayName: tm.displayName || tm.id
                    },
                    data: decodeTilemap(tm, id => {
                        if (tileMapping[id]) {
                            id = tileMapping[id];
                        }
                        return this.resolveTile(id);
                    })
                });
            }
        }
        loadAssetsJRes(jres) {
            jres = pxt.inflateJRes(jres);
            const toInflate = [];
            for (const key of Object.keys(jres)) {
                const entry = jres[key];
                if (entry.tilemapTile) {
                    this.state.tiles.add(this.generateImage(entry, "tile" /* Tile */));
                }
                else if (entry.mimeType === pxt.IMAGE_MIME_TYPE) {
                    this.state.images.add(this.generateImage(entry, "image" /* Image */));
                }
                else if (entry.mimeType === pxt.ANIMATION_MIME_TYPE) {
                    const [animation, needsInflation] = this.generateAnimation(entry);
                    if (needsInflation) {
                        toInflate.push(animation);
                    }
                    else {
                        this.state.animations.add(animation);
                    }
                }
            }
            for (const animation of toInflate) {
                this.state.animations.add(this.inflateAnimation(animation, this.state.images.getSnapshot()));
            }
        }
        removeInactiveBlockAssets(activeBlockIDs) {
            cleanupCollection(this.state.images);
            cleanupCollection(this.state.tiles);
            cleanupCollection(this.state.tilemaps);
            cleanupCollection(this.state.animations);
            function cleanupCollection(collection) {
                const inactiveAssets = collection.getSnapshot(asset => { var _a; return !asset.meta.displayName && ((_a = asset.meta.blockIDs) === null || _a === void 0 ? void 0 : _a.some(id => activeBlockIDs.indexOf(id) === -1)); });
                const toRemove = [];
                for (const asset of inactiveAssets) {
                    if (asset.meta.blockIDs.length === 1)
                        toRemove.push(asset);
                    else {
                        asset.meta.blockIDs = asset.meta.blockIDs.filter(id => activeBlockIDs.indexOf(id) !== -1);
                        if (asset.meta.blockIDs.length === 0)
                            toRemove.push(asset);
                    }
                }
                for (const asset of toRemove) {
                    collection.removeByID(asset.id);
                }
            }
        }
        generateImage(entry, type) {
            return {
                internalID: this.getNewInternalId(),
                type: type,
                id: entry.id,
                meta: {
                    displayName: entry.displayName
                },
                jresData: entry.data,
                bitmap: pxt.sprite.getBitmapFromJResURL(`data:${pxt.IMAGE_MIME_TYPE};base64,${entry.data}`).data()
            };
        }
        generateAnimation(entry) {
            if (entry.dataEncoding === "json") {
                let data;
                try {
                    data = JSON.parse(entry.data);
                }
                catch (e) {
                    console.warn("could not parse json data of '" + entry.id + "'");
                }
                const anim = {
                    internalID: this.getNewInternalId(),
                    type: "animation" /* Animation */,
                    meta: {
                        displayName: entry.displayName
                    },
                    id: entry.id,
                    frames: [],
                    frameIds: data.frames,
                    interval: 100,
                    flippedHorizontal: data.flippedHorizontal
                };
                return [anim, true];
            }
            else {
                return [Object.assign(Object.assign({}, decodeAnimation(entry)), { internalID: this.getNewInternalId() }), false];
            }
        }
        inflateAnimation(animation, assets) {
            animation.frames = animation.frameIds.map(frameId => assets.find(entry => entry.id === frameId).bitmap);
            if (animation.flippedHorizontal) {
                animation.frames = animation.frames.map(frame => {
                    const source = pxt.sprite.Bitmap.fromData(frame);
                    const flipped = new pxt.sprite.Bitmap(frame.width, frame.height);
                    for (let x = 0; x < flipped.width; x++) {
                        for (let y = 0; y < flipped.height; y++) {
                            flipped.set(x, y, source.get(source.width - x - 1, y));
                        }
                    }
                    return flipped.data();
                });
            }
            return animation;
        }
        generateNewID(type) {
            switch (type) {
                case "animation" /* Animation */:
                    return this.generateNewIDInternal("animation" /* Animation */, pxt.sprite.ANIMATION_PREFIX, pxt.sprite.ANIMATION_NAMESPACE);
                case "image" /* Image */:
                    return this.generateNewIDInternal("image" /* Image */, pxt.sprite.IMAGE_PREFIX, pxt.sprite.IMAGES_NAMESPACE);
                case "tile" /* Tile */:
                    return this.generateNewIDInternal("tile" /* Tile */, pxt.sprite.TILE_PREFIX, pxt.sprite.TILE_NAMESPACE);
                case "tilemap" /* Tilemap */:
                    return this.generateNewIDInternal("tilemap" /* Tilemap */, lf("level"));
            }
        }
        generateNewIDInternal(type, varPrefix, namespaceString) {
            varPrefix = varPrefix.replace(/\d+$/, "");
            const prefix = namespaceString ? namespaceString + "." + varPrefix : varPrefix;
            let index = 1;
            while (this.isNameTaken(type, prefix + index)) {
                ++index;
            }
            return prefix + index;
        }
        onChange() {
            this.needsRebuild = true;
            this.state.revision = this.nextID++;
        }
        readImages(allJRes, isProjectFile = false) {
            const assets = [];
            const toInflate = [];
            for (const key of Object.keys(allJRes)) {
                const entry = allJRes[key];
                if (entry.tilemapTile) {
                    const tile = this.generateImage(entry, "tile" /* Tile */);
                    tile.isProjectTile = isProjectFile;
                    assets.push(tile);
                }
                else if (entry.mimeType === pxt.IMAGE_MIME_TYPE) {
                    assets.push(this.generateImage(entry, "image" /* Image */));
                }
                else if (entry.mimeType === pxt.ANIMATION_MIME_TYPE) {
                    const [animation, needsInflation] = this.generateAnimation(entry);
                    if (needsInflation) {
                        toInflate.push(animation);
                    }
                    else {
                        assets.push(animation);
                    }
                }
            }
            for (const animation of toInflate) {
                assets.push(this.inflateAnimation(animation, assets));
            }
            return assets;
        }
        cleanupTemporaryAssets() {
            const orphaned = this.state.images.getSnapshot(image => { var _a; return !image.meta.displayName && !((_a = image.meta.blockIDs) === null || _a === void 0 ? void 0 : _a.length); });
            for (const image of orphaned) {
                this.state.images.removeByID(image.id);
            }
        }
    }
    pxt.TilemapProject = TilemapProject;
    function getTilemaps(allJRes) {
        const res = [];
        for (const key of Object.keys(allJRes)) {
            const entry = allJRes[key];
            if (entry.mimeType === pxt.TILEMAP_MIME_TYPE) {
                res.push(entry);
            }
        }
        return res;
    }
    function emitTilemapsFromJRes(jres) {
        const entries = Object.keys(jres);
        const indent = "    ";
        let out = "";
        const tilemapEntries = [];
        const tileEntries = [];
        for (const key of entries) {
            if (key === "*")
                continue;
            const entry = jres[key];
            if (entry.tilemapTile) {
                // FIXME: we should get the "image.ofBuffer" and blockIdentity from pxtarget probably
                out += `${indent}//% fixedInstance jres blockIdentity=images._tile\n`;
                out += `${indent}export const ${key} = image.ofBuffer(hex\`\`);\n`;
                tileEntries.push({ keys: [entry.displayName, getShortIDCore("tile" /* Tile */, key, true)], expression: key });
            }
            if (entry.mimeType === pxt.TILEMAP_MIME_TYPE) {
                const tm = decodeTilemap(entry);
                tilemapEntries.push({ keys: [entry.displayName, getShortIDCore("tilemap" /* Tilemap */, entry.id)], expression: pxt.sprite.encodeTilemap(tm, "typescript") });
            }
        }
        if (tilemapEntries.length) {
            out += emitFactoryHelper("tilemap", tilemapEntries);
        }
        if (tileEntries.length) {
            out += emitFactoryHelper("tile", tileEntries);
        }
        const warning = lf("Auto-generated code. Do not edit.");
        return `// ${warning}\nnamespace ${pxt.sprite.TILE_NAMESPACE} {\n${out}\n}\n// ${warning}\n`;
    }
    pxt.emitTilemapsFromJRes = emitTilemapsFromJRes;
    function emitProjectImages(jres) {
        const entries = Object.keys(jres);
        let out = "";
        const imageEntries = [];
        const animationEntries = [];
        for (const key of entries) {
            if (key === "*")
                continue;
            const entry = jres[key];
            if (typeof entry === "string" || entry.mimeType === pxt.IMAGE_MIME_TYPE) {
                let expression;
                let factoryKeys = [getShortIDCore("image" /* Image */, key, true)];
                if (typeof entry === "string") {
                    expression = pxt.sprite.bitmapToImageLiteral(pxt.sprite.getBitmapFromJResURL(entry), "typescript");
                }
                else {
                    expression = pxt.sprite.bitmapToImageLiteral(pxt.sprite.getBitmapFromJResURL(entry.data), "typescript");
                    factoryKeys.push(entry.displayName);
                }
                imageEntries.push({
                    keys: factoryKeys,
                    expression
                });
            }
            else if (entry.mimeType === pxt.ANIMATION_MIME_TYPE) {
                const animation = decodeAnimation(entry);
                animationEntries.push({
                    keys: [entry.displayName, getShortIDCore("animation" /* Animation */, key, true)],
                    expression: `[${animation.frames.map(f => pxt.sprite.bitmapToImageLiteral(pxt.sprite.Bitmap.fromData(f), "typescript")).join(", ")}]`
                });
            }
        }
        const warning = lf("Auto-generated code. Do not edit.");
        out += emitFactoryHelper("image", imageEntries);
        out += emitFactoryHelper("animation", animationEntries);
        return `// ${warning}\nnamespace ${pxt.sprite.IMAGES_NAMESPACE} {\n${out}\n}\n// ${warning}\n`;
    }
    pxt.emitProjectImages = emitProjectImages;
    function emitFactoryHelper(factoryKind, expressions) {
        const indent = "    ";
        return "\n" +
            `${indent}helpers._registerFactory("${factoryKind}", function(name: string) {\n` +
            `${indent}${indent}switch(helpers.stringTrim(name)) {\n` +
            expressions.map(t => t.keys.filter(k => !!k).map(key => `${indent}${indent}${indent}case "${key}":`).join("\n") +
                `return ${t.expression};`).join("\n") + "\n" +
            `${indent}${indent}}\n` +
            `${indent}${indent}return null;\n` +
            `${indent}})\n`;
    }
    function cloneBitmap(bitmap) {
        return pxt.sprite.Bitmap.fromData(bitmap).copy().data();
    }
    function decodeTilemap(jres, resolveTile) {
        const hex = atob(jres.data);
        const bytes = pxt.U.fromHex(hex);
        const tmWidth = bytes[1] | (bytes[2] << 8);
        const tmHeight = bytes[3] | (bytes[4] << 8);
        const tileset = {
            tileWidth: bytes[0],
            tiles: jres.tileset.map(id => (resolveTile && resolveTile(id)) || { id })
        };
        const tilemapStart = 5;
        const tmData = bytes.slice(tilemapStart, tilemapStart + tmWidth * tmHeight);
        const tilemap = new pxt.sprite.Tilemap(tmWidth, tmHeight, 0, 0, new Uint8ClampedArray(tmData));
        const bitmapData = bytes.slice(tilemapStart + tmData.length);
        const layers = new pxt.sprite.Bitmap(tmWidth, tmHeight, 0, 0, new Uint8ClampedArray(bitmapData)).data();
        return new pxt.sprite.TilemapData(tilemap, tileset, layers);
    }
    function cloneAsset(asset) {
        asset.meta = Object.assign({}, asset.meta);
        switch (asset.type) {
            case "tile" /* Tile */:
            case "image" /* Image */:
                return Object.assign(Object.assign({}, asset), { bitmap: cloneBitmap(asset.bitmap) });
            case "animation" /* Animation */:
                return Object.assign(Object.assign({}, asset), { frames: asset.frames.map(frame => cloneBitmap(frame)) });
            case "tilemap" /* Tilemap */:
                return Object.assign(Object.assign({}, asset), { data: asset.data.cloneData() });
        }
    }
    pxt.cloneAsset = cloneAsset;
    function addAssetToJRes(asset, allJRes) {
        // Get the last part of the fully qualified name
        const id = asset.id.substr(asset.id.lastIndexOf(".") + 1);
        switch (asset.type) {
            case "image" /* Image */:
                allJRes[id] = asset.jresData;
                if (asset.meta.displayName) {
                    allJRes[id] = {
                        data: asset.jresData,
                        mimeType: pxt.IMAGE_MIME_TYPE,
                        displayName: asset.meta.displayName
                    };
                }
                break;
            case "tile" /* Tile */:
                allJRes[id] = {
                    data: asset.jresData,
                    mimeType: pxt.IMAGE_MIME_TYPE,
                    tilemapTile: true,
                    displayName: asset.meta.displayName
                };
                break;
            case "tilemap" /* Tilemap */:
                // we include the full ID for tilemaps
                const serialized = serializeTilemap(asset.data, asset.id, asset.meta.displayName);
                allJRes[serialized.id] = serialized;
                break;
            case "animation" /* Animation */:
                allJRes[id] = serializeAnimation(asset);
                break;
        }
    }
    function assetEquals(a, b) {
        if (a == b)
            return true;
        if (a.id !== b.id || a.type !== b.type ||
            !arrayEquals(a.meta.tags, b.meta.tags) ||
            !arrayEquals(a.meta.blockIDs, b.meta.blockIDs) ||
            a.meta.displayName !== b.meta.displayName)
            return false;
        switch (a.type) {
            case "image" /* Image */:
            case "tile" /* Tile */:
                return pxt.sprite.bitmapEquals(a.bitmap, b.bitmap);
            case "animation" /* Animation */:
                const bAnimation = b;
                return a.interval === bAnimation.interval && arrayEquals(a.frames, bAnimation.frames, pxt.sprite.bitmapEquals);
            case "tilemap" /* Tilemap */:
                return a.data.equals(b.data);
        }
    }
    pxt.assetEquals = assetEquals;
    function validateAssetName(name) {
        if (!name)
            return false;
        // Covers all punctuation/whitespace except for "-", "_", and " "
        // eslint-disable-next-line no-control-regex
        const bannedRegex = /[\u0000-\u001f\u0021-\u002c\u002e\u002f\u003a-\u0040\u005b-\u005e\u0060\u007b-\u007f]/;
        return !bannedRegex.test(name);
    }
    pxt.validateAssetName = validateAssetName;
    function getTSReferenceForAsset(asset, isPython = false) {
        var _a;
        let shortId;
        if ((_a = asset.meta) === null || _a === void 0 ? void 0 : _a.displayName) {
            shortId = asset.meta.displayName;
        }
        else {
            shortId = getShortIDForAsset(asset);
        }
        if (!shortId) {
            if (asset.type === "image" /* Image */ || asset.type === "tile" /* Tile */) {
                // Use the qualified name
                return asset.id;
            }
            return undefined;
        }
        const leftTick = isPython ? `("""` : "`";
        const rightTick = isPython ? `""")` : "`";
        switch (asset.type) {
            case "tile" /* Tile */:
                return `assets.tile${leftTick}${shortId}${rightTick}`;
            case "image" /* Image */:
                return `assets.image${leftTick}${shortId}${rightTick}`;
            case "animation" /* Animation */:
                return `assets.animation${leftTick}${shortId}${rightTick}`;
            case "tilemap" /* Tilemap */:
                return `tilemap${leftTick}${shortId}${rightTick}`;
        }
    }
    pxt.getTSReferenceForAsset = getTSReferenceForAsset;
    function parseAssetTSReference(ts) {
        const match = /^\s*(?:(?:assets\s*\.\s*(image|tile|animation|tilemap))|(tilemap))\s*(?:`|\(""")([^`"]+)(?:`|"""\))\s*$/m.exec(ts);
        if (match) {
            const type = match[1] || match[2];
            const name = match[3].trim();
            return {
                type, name
            };
        }
        return undefined;
    }
    pxt.parseAssetTSReference = parseAssetTSReference;
    function lookupProjectAssetByTSReference(ts, project) {
        const match = parseAssetTSReference(ts);
        if (match) {
            const { type, name } = match;
            switch (type) {
                case "tile":
                    return project.lookupAssetByName("tile" /* Tile */, name);
                case "image":
                    return project.lookupAssetByName("image" /* Image */, name);
                case "tilemap":
                    return project.lookupAssetByName("tilemap" /* Tilemap */, name) || project.lookupAsset("tilemap" /* Tilemap */, name);
                case "animation":
                    return project.lookupAssetByName("animation" /* Animation */, name);
            }
        }
        return undefined;
    }
    pxt.lookupProjectAssetByTSReference = lookupProjectAssetByTSReference;
    function getShortIDForAsset(asset) {
        return getShortIDCore(asset.type, asset.id);
    }
    pxt.getShortIDForAsset = getShortIDForAsset;
    function getShortIDCore(assetType, id, allowNoPrefix = false) {
        let prefix;
        switch (assetType) {
            case "image" /* Image */:
                prefix = pxt.sprite.IMAGES_NAMESPACE + ".";
                break;
            case "tile" /* Tile */:
                prefix = pxt.sprite.TILE_NAMESPACE + ".";
                break;
            case "tilemap" /* Tilemap */:
                prefix = "";
                break;
            case "animation" /* Animation */:
                prefix = pxt.sprite.ANIMATION_NAMESPACE + ".";
                break;
        }
        if (prefix) {
            if (id.startsWith(prefix)) {
                const short = id.substr(prefix.length);
                if (short.indexOf(".") === -1)
                    return short;
            }
            else if (!allowNoPrefix) {
                return null;
            }
        }
        return id;
    }
    function arrayEquals(a, b, compare = (c, d) => c === d) {
        if (a == b)
            return true;
        if (!a && b || !b && a || a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!compare(a[i], b[i]))
                return false;
        }
        return true;
    }
    function serializeTilemap(tilemap, id, name) {
        const tm = tilemap.tilemap.data();
        const data = new Uint8ClampedArray(5 + tm.data.length + tilemap.layers.data.length);
        data[0] = tilemap.tileset.tileWidth;
        data[1] = tm.width & 0xff;
        data[2] = (tm.width >> 8) & 0xff;
        data[3] = tm.height & 0xff;
        data[4] = (tm.height >> 8) & 0xff;
        data.set(tm.data, 5);
        data.set(tilemap.layers.data, 5 + tm.data.length);
        return {
            id,
            mimeType: pxt.TILEMAP_MIME_TYPE,
            data: btoa(pxt.sprite.uint8ArrayToHex(data)),
            tileset: tilemap.tileset.tiles.map(t => t.id),
            displayName: name
        };
    }
    function serializeAnimation(asset) {
        return {
            namespace: asset.id.substr(0, asset.id.lastIndexOf(".")),
            id: asset.id.substr(asset.id.lastIndexOf(".") + 1),
            mimeType: pxt.ANIMATION_MIME_TYPE,
            data: pxt.sprite.encodeAnimationString(asset.frames, asset.interval),
            displayName: asset.meta.displayName
        };
    }
    function decodeAnimation(jres) {
        const hex = atob(jres.data);
        const bytes = new Uint8ClampedArray(pxt.U.fromHex(hex));
        const interval = read16Bit(bytes, 0);
        const frameWidth = read16Bit(bytes, 2);
        const frameHeight = read16Bit(bytes, 4);
        const frameCount = read16Bit(bytes, 6);
        const frameLength = Math.ceil((frameWidth * frameHeight) / 2);
        let offset = 8;
        const decodedFrames = [];
        for (let i = 0; i < frameCount; i++) {
            const frameData = bytes.slice(offset, offset + frameLength);
            decodedFrames.push({
                x0: 0,
                y0: 0,
                width: frameWidth,
                height: frameHeight,
                data: frameData
            });
            offset += frameLength;
        }
        let id = jres.id;
        if (!id.startsWith(jres.namespace)) {
            id = jres.namespace + "." + id;
            id = id.replace(/\.\./g, ".");
        }
        return {
            type: "animation" /* Animation */,
            internalID: 0,
            id: id,
            interval,
            frames: decodedFrames,
            meta: {
                displayName: jres.displayName
            }
        };
    }
    function set16Bit(buf, offset, value) {
        buf[offset] = value & 0xff;
        buf[offset + 1] = (value >> 8) & 0xff;
    }
    function read16Bit(buf, offset) {
        return buf[offset] | (buf[offset + 1] << 8);
    }
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var toolbox;
    (function (toolbox) {
        toolbox.blockColors = {
            loops: '#107c10',
            logic: '#006970',
            math: '#712672',
            variables: '#A80000',
            functions: '#005a9e',
            text: '#996600',
            arrays: '#A94400',
            advanced: '#3c3c3c',
            addpackage: '#717171',
            search: '#000',
            debug: '#e03030',
            default: '#dddddd',
            topblocks: '#aa8f00',
            recipes: '#717171'
        };
        toolbox.blockIcons = {
            loops: '\uf01e',
            logic: '\uf074',
            math: '\uf1ec',
            variables: '\uf039',
            functions: '\uf109',
            text: '\uf035',
            arrays: '\uf0cb',
            advancedcollapsed: '\uf078',
            advancedexpanded: '\uf077',
            more: '\uf141',
            addpackage: '\uf055',
            search: '\uf002',
            debug: '\uf111',
            default: '\uf12e',
            topblocks: '\uf005',
            recipes: '\uf0eb'
        };
        let toolboxStyleBuffer = '';
        function appendToolboxIconCss(className, i) {
            if (toolboxStyleBuffer.indexOf(className) > -1)
                return;
            if (i.length === 1) {
                const icon = pxt.Util.unicodeToChar(i);
                toolboxStyleBuffer += `
                .blocklyTreeIcon.${className}::before {
                    content: "${icon}";
                }
            `;
            }
            else {
                toolboxStyleBuffer += `
                .blocklyTreeIcon.${className} {
                    background-image: url("${pxt.Util.pathJoin(pxt.webConfig.commitCdnUrl, encodeURI(i))}")!important;
                    width: 30px;
                    height: 100%;
                    background-size: 20px !important;
                    background-repeat: no-repeat !important;
                    background-position: 50% 50% !important;
                }
            `;
            }
        }
        toolbox.appendToolboxIconCss = appendToolboxIconCss;
        function getNamespaceColor(ns) {
            ns = ns.toLowerCase();
            if (pxt.appTarget.appTheme.blockColors && pxt.appTarget.appTheme.blockColors[ns])
                return pxt.appTarget.appTheme.blockColors[ns];
            if (pxt.toolbox.blockColors[ns])
                return pxt.toolbox.blockColors[ns];
            return "";
        }
        toolbox.getNamespaceColor = getNamespaceColor;
        function getNamespaceIcon(ns) {
            ns = ns.toLowerCase();
            if (pxt.appTarget.appTheme.blockIcons && pxt.appTarget.appTheme.blockIcons[ns]) {
                return pxt.appTarget.appTheme.blockIcons[ns];
            }
            if (pxt.toolbox.blockIcons[ns]) {
                return pxt.toolbox.blockIcons[ns];
            }
            return "";
        }
        toolbox.getNamespaceIcon = getNamespaceIcon;
        function advancedTitle() { return pxt.Util.lf("{id:category}Advanced"); }
        toolbox.advancedTitle = advancedTitle;
        function addPackageTitle() { return pxt.Util.lf("{id:category}Extensions"); }
        toolbox.addPackageTitle = addPackageTitle;
        function recipesTitle() { return pxt.Util.lf("{id:category}Tutorials"); }
        toolbox.recipesTitle = recipesTitle;
        /**
         * Convert blockly hue to rgb
         */
        function convertColor(colour) {
            colour = parseHex(colour); // convert from 0x hex encoding if necessary
            const hue = parseInt(colour);
            if (!isNaN(hue)) {
                return hueToRgb(hue);
            }
            return colour;
        }
        toolbox.convertColor = convertColor;
        function hueToRgb(hue) {
            const HSV_SATURATION = 0.45;
            const HSV_VALUE = 0.65 * 255;
            const rgbArray = hsvToRgb(hue, HSV_SATURATION, HSV_VALUE);
            return `#${componentToHex(rgbArray[0])}${componentToHex(rgbArray[1])}${componentToHex(rgbArray[2])}`;
        }
        toolbox.hueToRgb = hueToRgb;
        /**
         * Converts an HSV triplet to an RGB array.  V is brightness because b is
         *   reserved for blue in RGB.
         * Closure's HSV to RGB function: https://github.com/google/closure-library/blob/master/closure/goog/color/color.js#L613
         */
        function hsvToRgb(h, s, brightness) {
            let red = 0;
            let green = 0;
            let blue = 0;
            if (s == 0) {
                red = brightness;
                green = brightness;
                blue = brightness;
            }
            else {
                let sextant = Math.floor(h / 60);
                let remainder = (h / 60) - sextant;
                let val1 = brightness * (1 - s);
                let val2 = brightness * (1 - (s * remainder));
                let val3 = brightness * (1 - (s * (1 - remainder)));
                switch (sextant) {
                    case 1:
                        red = val2;
                        green = brightness;
                        blue = val1;
                        break;
                    case 2:
                        red = val1;
                        green = brightness;
                        blue = val3;
                        break;
                    case 3:
                        red = val1;
                        green = val2;
                        blue = brightness;
                        break;
                    case 4:
                        red = val3;
                        green = val1;
                        blue = brightness;
                        break;
                    case 5:
                        red = brightness;
                        green = val1;
                        blue = val2;
                        break;
                    case 6:
                    case 0:
                        red = brightness;
                        green = val3;
                        blue = val1;
                        break;
                }
            }
            return [Math.floor(red), Math.floor(green), Math.floor(blue)];
        }
        function componentToHex(c) {
            const hex = c.toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        }
        function parseHex(s) {
            if (!s)
                return "#000000";
            if (s.substring(0, 2) == "0x")
                return "#" + s.substring(2);
            return s;
        }
        function fadeColor(hex, luminosity, lighten) {
            // #ABC => ABC
            hex = hex.replace(/[^0-9a-f]/gi, '');
            // ABC => AABBCC
            if (hex.length < 6)
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            // tweak
            let rgb = "#";
            for (let i = 0; i < 3; i++) {
                let c = parseInt(hex.substr(i * 2, 2), 16);
                c = Math.round(Math.min(Math.max(0, lighten ? c + (c * luminosity) : c - (c * luminosity)), 255));
                let cStr = c.toString(16);
                rgb += ("00" + cStr).substr(cStr.length);
            }
            return rgb;
        }
        toolbox.fadeColor = fadeColor;
    })(toolbox = pxt.toolbox || (pxt.toolbox = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var tutorial;
    (function (tutorial) {
        const _h2Regex = /^##[^#](.*)$([\s\S]*?)(?=^##[^#]|$(?![\r\n]))/gmi;
        const _h3Regex = /^###[^#](.*)$([\s\S]*?)(?=^###[^#]|$(?![\r\n]))/gmi;
        function parseTutorial(tutorialmd) {
            const { metadata, body } = parseTutorialMetadata(tutorialmd);
            const { steps, activities } = parseTutorialMarkdown(body, metadata);
            const title = parseTutorialTitle(body);
            if (!steps)
                return undefined; // error parsing steps
            // collect code and infer editor
            const { code, templateCode, editor, language, jres, assetJson, customTs, tutorialValidationRulesStr } = computeBodyMetadata(body);
            // parses tutorial rules string into a map of rules and enablement flag 
            let tutorialValidationRules;
            if (metadata.tutorialCodeValidation) {
                tutorialValidationRules = pxt.Util.jsonTryParse(tutorialValidationRulesStr);
                categorizingValidationRules(tutorialValidationRules, title);
            }
            // noDiffs legacy
            if (metadata.diffs === true // enabled in tutorial
                || (metadata.diffs !== false && metadata.noDiffs !== true // not disabled
                    && ((editor == pxt.BLOCKS_PROJECT_NAME && pxt.appTarget.appTheme.tutorialBlocksDiff) //blocks enabled always
                        || (editor != pxt.BLOCKS_PROJECT_NAME && pxt.appTarget.appTheme.tutorialTextDiff) // text enabled always
                    ))) {
                diffify(steps, activities);
            }
            const assetFiles = parseAssetJson(assetJson);
            // strip hidden snippets
            steps.forEach(step => {
                step.contentMd = stripHiddenSnippets(step.contentMd);
                step.headerContentMd = stripHiddenSnippets(step.headerContentMd);
                step.hintContentMd = stripHiddenSnippets(step.hintContentMd);
                step.requiredBlockMd = stripHiddenSnippets(step.requiredBlockMd);
            });
            return {
                editor,
                title,
                steps,
                activities,
                code,
                templateCode,
                metadata,
                language,
                jres,
                assetFiles,
                customTs,
                tutorialValidationRules
            };
        }
        tutorial.parseTutorial = parseTutorial;
        function getMetadataRegex() {
            return /``` *(sim|block|blocks|filterblocks|spy|ghost|typescript|ts|js|javascript|template|python|jres|assetjson|customts|tutorialValidationRules|requiredTutorialBlock)\s*\n([\s\S]*?)\n```/gmi;
        }
        tutorial.getMetadataRegex = getMetadataRegex;
        function computeBodyMetadata(body) {
            // collect code and infer editor
            let editor = undefined;
            const regex = getMetadataRegex();
            let jres;
            let code = [];
            let templateCode;
            let language;
            let idx = 0;
            let assetJson;
            let customTs;
            let tutorialValidationRulesStr;
            // Concatenate all blocks in separate code blocks and decompile so we can detect what blocks are used (for the toolbox)
            body
                .replace(/((?!.)\s)+/g, "\n")
                .replace(regex, function (m0, m1, m2) {
                switch (m1) {
                    case "block":
                    case "blocks":
                    case "requiredTutorialBlock":
                    case "filterblocks":
                        if (!checkTutorialEditor(pxt.BLOCKS_PROJECT_NAME))
                            return undefined;
                        break;
                    case "spy":
                    case "python":
                        if (!checkTutorialEditor(pxt.PYTHON_PROJECT_NAME))
                            return undefined;
                        if (m1 == "python")
                            language = m1;
                        break;
                    case "typescript":
                    case "ts":
                    case "javascript":
                    case "js":
                        if (!checkTutorialEditor(pxt.JAVASCRIPT_PROJECT_NAME))
                            return undefined;
                        break;
                    case "template":
                        templateCode = m2;
                        break;
                    case "jres":
                        jres = m2;
                        break;
                    case "assetjson":
                        assetJson = m2;
                        break;
                    case "customts":
                        customTs = m2;
                        m2 = "";
                        break;
                    case "tutorialValidationRules":
                        tutorialValidationRulesStr = m2;
                        break;
                }
                code.push(m1 == "python" ? `\n${m2}\n` : `{\n${m2}\n}`);
                idx++;
                return "";
            });
            // default to blocks
            editor = editor || pxt.BLOCKS_PROJECT_NAME;
            return { code, templateCode, editor, language, jres, assetJson, customTs, tutorialValidationRulesStr };
            function checkTutorialEditor(expected) {
                if (editor && editor != expected) {
                    pxt.debug(`tutorial ambiguous: contains snippets of different types`);
                    return false;
                }
                else {
                    editor = expected;
                    return true;
                }
            }
        }
        function diffify(steps, activities) {
            // convert typescript snippets into diff snippets
            let lastSrc = undefined;
            steps.forEach((step, stepi) => {
                // reset diff on each activity or when requested
                if (step.resetDiff
                    || (activities && activities.find(activity => activity.step == stepi)))
                    lastSrc = undefined;
                // extract typescript snippet from hint or content
                if (step.hintContentMd) {
                    const s = convertSnippetToDiff(step.hintContentMd);
                    if (s && s != step.hintContentMd) {
                        step.hintContentMd = s;
                        return;
                    }
                }
                if (step.headerContentMd) {
                    const s = convertSnippetToDiff(step.headerContentMd);
                    if (s && s != step.headerContentMd) {
                        step.headerContentMd = s;
                        return;
                    }
                }
            });
            function convertSnippetToDiff(src) {
                const diffClasses = {
                    "typescript": "diff",
                    "spy": "diffspy",
                    "blocks": "diffblocks",
                    "python": "diff"
                };
                const highlightRx = /\s*(\/\/|#)\s*@highlight/gm;
                if (!src)
                    return src;
                return src
                    .replace(/```(typescript|spy|python|blocks|ghost|template)((?:.|[\r\n])+)```/, function (m, type, code) {
                    const fileA = lastSrc;
                    const hidden = /^(template|ghost)$/.test(type);
                    const hasHighlight = highlightRx.test(code);
                    code = code.replace(/^\n+/, '').replace(/\n+$/, ''); // always trim lines
                    if (hasHighlight)
                        code = code.replace(highlightRx, '');
                    lastSrc = code;
                    if (!fileA || hasHighlight || hidden)
                        return m; // leave unchanged or reuse highlight info
                    else
                        return `\`\`\`${diffClasses[type]}
${fileA}
----------
${code}
\`\`\``;
                });
            }
        }
        function parseTutorialTitle(tutorialmd) {
            let title = tutorialmd.match(/^#[^#](.*)$/mi);
            return title && title.length > 1 ? title[1] : null;
        }
        function parseTutorialMarkdown(tutorialmd, metadata) {
            if (metadata && metadata.activities) {
                // tutorial with "## ACTIVITY", "### STEP" syntax
                return parseTutorialActivities(tutorialmd, metadata);
            }
            else {
                // tutorial with "## STEP" syntax
                let steps = parseTutorialSteps(tutorialmd, null, metadata);
                // old: "### STEP" syntax (no activity header guaranteed)
                if (!steps || steps.length < 1)
                    steps = parseTutorialSteps(tutorialmd, _h3Regex, metadata);
                return { steps: steps, activities: null };
            }
        }
        function parseTutorialActivities(markdown, metadata) {
            let stepInfo = [];
            let activityInfo = [];
            markdown.replace(_h2Regex, function (match, name, activity) {
                let i = activityInfo.length;
                activityInfo.push({
                    name: name || lf("Activity {0}", i),
                    step: stepInfo.length
                });
                let steps = parseTutorialSteps(activity, _h3Regex, metadata);
                steps = steps.map(step => {
                    step.activity = i;
                    return step;
                });
                stepInfo = stepInfo.concat(steps);
                return "";
            });
            return { steps: stepInfo, activities: activityInfo };
        }
        function parseTutorialSteps(markdown, regex, metadata) {
            // use regex override if present
            let stepRegex = regex || _h2Regex;
            let stepInfo = [];
            markdown.replace(stepRegex, function (match, flags, step) {
                step = step.trim();
                let { header, hint, requiredBlocks } = parseTutorialHint(step, metadata && metadata.explicitHints, metadata.tutorialCodeValidation);
                let info = {
                    contentMd: step,
                    headerContentMd: header
                };
                if (/@(fullscreen|unplugged|showdialog|showhint)/i.test(flags))
                    info.showHint = true;
                if (/@(unplugged|showdialog)/i.test(flags))
                    info.showDialog = true;
                if (/@tutorialCompleted/.test(flags))
                    info.tutorialCompleted = true;
                if (/@resetDiff/.test(flags))
                    info.resetDiff = true;
                if (hint)
                    info.hintContentMd = hint;
                if (metadata.tutorialCodeValidation && requiredBlocks)
                    info.requiredBlockMd = requiredBlocks;
                stepInfo.push(info);
                return "";
            });
            if (markdown.indexOf("# Not found") == 0) {
                pxt.debug(`tutorial not found`);
                return undefined;
            }
            return stepInfo;
        }
        function parseTutorialHint(step, explicitHints, tutorialCodeValidationEnabled) {
            // remove hidden code sections
            step = stripHiddenSnippets(step);
            let header = step, hint;
            let requiredBlocks;
            if (explicitHints) {
                // hint is explicitly set with hint syntax "#### ~ tutorialhint" and terminates at the next heading
                const hintTextRegex = /#+ ~ tutorialhint([\s\S]*)/i;
                header = step.replace(hintTextRegex, function (f, m) {
                    hint = m;
                    return "";
                });
            }
            else {
                // everything after the first ``` section OR the first image is treated as a "hint"
                const hintTextRegex = /(^[\s\S]*?\S)\s*((```|\!\[[\s\S]+?\]\(\S+?\))[\s\S]*)/mi;
                let hintText = step.match(hintTextRegex);
                if (hintText && hintText.length > 2) {
                    header = hintText[1].trim();
                    hint = hintText[2].trim();
                    if (tutorialCodeValidationEnabled) {
                        let hintSnippet = hintText[2].trim();
                        hintSnippet = hintSnippet.replace(/``` *(requiredTutorialBlock)\s*\n([\s\S]*?)\n```/gmi, function (m0, m1, m2) {
                            requiredBlocks = `{\n${m2}\n}`;
                            return "";
                        });
                        hint = hintSnippet;
                    }
                }
            }
            return { header, hint, requiredBlocks };
        }
        function categorizingValidationRules(listOfRules, title) {
            const ruleNames = Object.keys(listOfRules);
            for (let i = 0; i < ruleNames.length; i++) {
                const setValidationRule = {
                    ruleName: ruleNames[i],
                    enabled: listOfRules[ruleNames[i]] ? 'true' : 'false',
                    tutorial: title,
                };
                pxt.tickEvent('tutorial.validation.setValidationRules', setValidationRule);
            }
        }
        /* Remove hidden snippets from text */
        function stripHiddenSnippets(str) {
            if (!str)
                return str;
            const hiddenSnippetRegex = /```(filterblocks|package|ghost|config|template|jres|assetjson|customts)\s*\n([\s\S]*?)\n```/gmi;
            return str.replace(hiddenSnippetRegex, '').trim();
        }
        /*
            Parses metadata at the beginning of tutorial markown. Metadata is a key-value
            pair in the format: `### @KEY VALUE`
        */
        function parseTutorialMetadata(tutorialmd) {
            const metadataRegex = /### @(\S+) ([ \S]+)/gi;
            const m = {};
            const body = tutorialmd.replace(metadataRegex, function (f, k, v) {
                try {
                    m[k] = JSON.parse(v);
                }
                catch (_a) {
                    m[k] = v;
                }
                return "";
            });
            const metadata = m;
            if (metadata.explicitHints !== undefined
                && pxt.appTarget.appTheme
                && pxt.appTarget.appTheme.tutorialExplicitHints)
                metadata.explicitHints = true;
            return { metadata, body };
        }
        function highlight(pre) {
            let text = pre.textContent;
            // collapse image python/js literales
            text = text.replace(/img\s*\(\s*"{3}(.|\n)*"{3}\s*\)/g, `img(""" """)`);
            text = text.replace(/img\s*\s*`(.|\n)*`\s*/g, "img` `");
            if (!/@highlight/.test(text)) { // shortcut, nothing to do
                pre.textContent = text;
                return;
            }
            // render lines
            pre.textContent = ""; // clear up and rebuild
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; ++i) {
                if (i > 0 && i < lines.length)
                    pre.appendChild(document.createTextNode("\n"));
                let line = lines[i];
                if (/@highlight/.test(line)) {
                    // highlight next line
                    line = lines[++i];
                    if (line !== undefined) {
                        const span = document.createElement("span");
                        span.className = "highlight-line";
                        span.textContent = line;
                        pre.appendChild(span);
                    }
                }
                else {
                    pre.appendChild(document.createTextNode(line));
                }
            }
        }
        tutorial.highlight = highlight;
        function getTutorialOptions(md, tutorialId, filename, reportId, recipe) {
            var _a;
            const tutorialInfo = pxt.tutorial.parseTutorial(md);
            if (!tutorialInfo)
                throw new Error(lf("Invalid tutorial format"));
            const tutorialOptions = {
                tutorial: tutorialId,
                tutorialName: tutorialInfo.title || filename,
                tutorialReportId: reportId,
                tutorialStep: 0,
                tutorialReady: true,
                tutorialHintCounter: 0,
                tutorialStepInfo: tutorialInfo.steps,
                tutorialActivityInfo: tutorialInfo.activities,
                tutorialMd: md,
                tutorialCode: tutorialInfo.code,
                tutorialRecipe: !!recipe,
                templateCode: tutorialInfo.templateCode,
                autoexpandStep: ((_a = tutorialInfo.metadata) === null || _a === void 0 ? void 0 : _a.autoexpandOff) ? false : true,
                metadata: tutorialInfo.metadata,
                language: tutorialInfo.language,
                jres: tutorialInfo.jres,
                assetFiles: tutorialInfo.assetFiles,
                customTs: tutorialInfo.customTs,
                tutorialValidationRules: tutorialInfo.tutorialValidationRules
            };
            return { options: tutorialOptions, editor: tutorialInfo.editor };
        }
        tutorial.getTutorialOptions = getTutorialOptions;
        function parseCachedTutorialInfo(json, id) {
            let cachedInfo = pxt.Util.jsonTryParse(json);
            if (!cachedInfo)
                return Promise.resolve();
            return pxt.BrowserUtils.tutorialInfoDbAsync()
                .then(db => {
                if (id && cachedInfo[id]) {
                    const info = cachedInfo[id];
                    if (info.usedBlocks && info.hash)
                        db.setWithHashAsync(id, info.snippetBlocks, info.hash);
                }
                else {
                    for (let key of Object.keys(cachedInfo)) {
                        const info = cachedInfo[key];
                        if (info.usedBlocks && info.hash)
                            db.setWithHashAsync(key, info.snippetBlocks, info.hash);
                    }
                }
            }).catch((err) => { });
        }
        tutorial.parseCachedTutorialInfo = parseCachedTutorialInfo;
        function resolveLocalizedMarkdown(ghid, files, fileName) {
            // if non-default language, find localized file if any
            const mfn = (fileName || ghid.fileName || "README") + ".md";
            let md = undefined;
            const [initialLang, baseLang, initialLangLowerCase] = pxt.Util.normalizeLanguageCode(pxt.Util.userLanguage());
            if (initialLang && baseLang && initialLangLowerCase) {
                //We need to first search base lang and then intial Lang
                //Example: normalizeLanguageCode en-IN  will return ["en-IN", "en", "en-in"] and nb will be returned as ["nb"]
                md = files[`_locales/${initialLang}/${mfn}`]
                    || files[`_locales/${initialLangLowerCase}/${mfn}`]
                    || files[`_locales/${baseLang}/${mfn}`];
            }
            else {
                md = files[`_locales/${initialLang}/${mfn}`];
            }
            md = md || files[mfn];
            return md;
        }
        tutorial.resolveLocalizedMarkdown = resolveLocalizedMarkdown;
        function parseAssetJson(json) {
            if (!json)
                return undefined;
            const files = JSON.parse(json);
            return {
                [pxt.TILEMAP_JRES]: files[pxt.TILEMAP_JRES],
                [pxt.TILEMAP_CODE]: files[pxt.TILEMAP_CODE],
                [pxt.IMAGES_JRES]: files[pxt.IMAGES_JRES],
                [pxt.IMAGES_CODE]: files[pxt.IMAGES_CODE]
            };
        }
        tutorial.parseAssetJson = parseAssetJson;
    })(tutorial = pxt.tutorial || (pxt.tutorial = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var tutorial;
    (function (tutorial_1) {
        /**
        * Check the user's code to the map of tutorial validation rules from TutorialOptions and returns an array of TutorialRuleStatus
        * @param tutorial the tutorial
        * @param workspaceBlocks Blockly blocks used of workspace
        * @param blockinfo Typescripts of the workspace
        * @return A TutorialRuleStatus
        */
        async function validate(tutorial, workspaceBlocks, blockinfo) {
            const listOfRules = tutorial.tutorialValidationRules;
            let TutorialRuleStatuses = classifyRules(listOfRules);
            // Check to if there are rules to valdiate and to see if there are blocks are in the workspace to compare to
            if (TutorialRuleStatuses.length > 0 && workspaceBlocks.length > 0) {
                // User blocks
                const userBlockTypes = workspaceBlocks.map(b => b.type);
                const usersBlockUsed = blockCount(userBlockTypes);
                // Tutorial blocks
                const { tutorialStepInfo, tutorialStep } = tutorial;
                const step = tutorialStepInfo[tutorialStep];
                const indexdb = await tutorialBlockList(tutorial, step);
                const tutorialBlockUsed = extractBlockSnippet(tutorial, indexdb);
                for (let i = 0; i < TutorialRuleStatuses.length; i++) {
                    let currRuleToValidate = TutorialRuleStatuses[i];
                    const ruleName = TutorialRuleStatuses[i].ruleName;
                    const isRuleEnabled = TutorialRuleStatuses[i].ruleTurnOn;
                    if (isRuleEnabled) {
                        switch (ruleName) {
                            case "exact":
                                currRuleToValidate = validateExactNumberOfBlocks(usersBlockUsed, tutorialBlockUsed, currRuleToValidate);
                                break;
                            case "atleast":
                                currRuleToValidate = validateAtleastOneBlocks(usersBlockUsed, tutorialBlockUsed, currRuleToValidate);
                                break;
                            case "required":
                                const requiredBlocksList = extractRequiredBlockSnippet(tutorial, indexdb);
                                currRuleToValidate = validateMeetRequiredBlocks(usersBlockUsed, requiredBlocksList, currRuleToValidate);
                                break;
                        }
                    }
                }
            }
            return TutorialRuleStatuses;
        }
        tutorial_1.validate = validate;
        /**
        * Gives each rule from the markdown file a TutorialRuleStatus
        * @param listOfRules a map of rules from makrdown file
        * @return An array of TutorialRuleStatus
        */
        function classifyRules(listOfRules) {
            let listOfRuleStatuses = [];
            if (listOfRules != undefined) {
                const ruleNames = Object.keys(listOfRules);
                for (let i = 0; i < ruleNames.length; i++) {
                    const currRule = ruleNames[i];
                    const ruleVal = listOfRules[currRule];
                    const currRuleStatus = { ruleName: currRule, ruleTurnOn: ruleVal };
                    listOfRuleStatuses.push(currRuleStatus);
                }
            }
            return listOfRuleStatuses;
        }
        /**
        * Loops through an array of blocks and returns a map of blocks and the count for that block
        * @param arr a string array of blocks
        * @return a map <Block type, frequency>
        */
        function blockCount(arr) {
            let frequencyMap = {};
            for (let i = 0; i < arr.length; i++) {
                if (!frequencyMap[arr[i]]) {
                    frequencyMap[arr[i]] = 0;
                }
                frequencyMap[arr[i]] = frequencyMap[arr[i]] + 1;
            }
            return frequencyMap;
        }
        /**
        * Returns information from index database
        * @param tutorial Typescripts of the workspace
        * @param step the current tutorial step
        * @return indexdb's tutorial code snippets
        */
        function tutorialBlockList(tutorial, step) {
            return pxt.BrowserUtils.tutorialInfoDbAsync()
                .then(db => db.getAsync(tutorial.tutorial, tutorial.tutorialCode)
                .then(entry => {
                if (entry === null || entry === void 0 ? void 0 : entry.snippets) {
                    return Promise.resolve(entry.snippets);
                }
                else {
                    return Promise.resolve(undefined);
                }
            }));
        }
        /**
        * Extract the tutorial blocks used from code snippet
        * @param tutorial tutorial info
        * @param indexdb database from index
        * @return the tutorial blocks used for the current step
        */
        function extractBlockSnippet(tutorial, indexdb) {
            const { tutorialStepInfo, tutorialStep } = tutorial;
            const body = tutorial.tutorialStepInfo[tutorialStep].hintContentMd;
            let hintCode = "";
            if (body != undefined) {
                body.replace(/((?!.)\s)+/g, "\n").replace(/``` *(block|blocks)\s*\n([\s\S]*?)\n```/gmi, function (m0, m1, m2) {
                    hintCode = `{\n${m2}\n}`;
                    return "";
                });
            }
            const snippetStepKey = pxt.BrowserUtils.getTutorialCodeHash([hintCode]);
            let blockMap = {};
            if (indexdb != undefined) {
                blockMap = indexdb[snippetStepKey];
            }
            return blockMap;
        }
        /**
        * Extract the required tutorial blocks  from code snippet
        * @param tutorial tutorial info
        * @param indexdb database from index
        * @return the tutorial blocks used for the current step
        */
        function extractRequiredBlockSnippet(tutorial, indexdb) {
            const { tutorialStep } = tutorial;
            const body = tutorial.tutorialStepInfo[tutorialStep].requiredBlockMd;
            const snippetStepKey = pxt.BrowserUtils.getTutorialCodeHash([body]);
            let blockMap = {};
            if (indexdb != undefined) {
                blockMap = indexdb[snippetStepKey];
            }
            return blockMap;
        }
        /**
        * Strict Rule: Checks if the all required number of blocks for a tutorial step is used, returns a TutorialRuleStatus
        * @param usersBlockUsed an array of strings
        * @param tutorialBlockUsed the next available index
        * @param currRule the current rule with its TutorialRuleStatus
        * @return a tutorial rule status for currRule
        */
        function validateExactNumberOfBlocks(usersBlockUsed, tutorialBlockUsed, currRule) {
            currRule.isStrict = true;
            const userBlockKeys = Object.keys(usersBlockUsed);
            let tutorialBlockKeys = [];
            let blockIds = [];
            if (tutorialBlockUsed != undefined) {
                tutorialBlockKeys = Object.keys(tutorialBlockUsed);
            }
            let isValid = userBlockKeys.length >= tutorialBlockKeys.length; // user has enough blocks
            const message = lf("These are the blocks you seem to be missing:");
            for (let i = 0; i < tutorialBlockKeys.length; i++) {
                let tutorialBlockKey = tutorialBlockKeys[i];
                if (!usersBlockUsed[tutorialBlockKey] // user did not use a specific block or
                    || usersBlockUsed[tutorialBlockKey] < tutorialBlockUsed[tutorialBlockKey]) { // user did not use enough of a certain block
                    blockIds.push(tutorialBlockKey);
                    isValid = false;
                }
            }
            currRule.ruleMessage = message;
            currRule.ruleStatus = isValid;
            currRule.blockIds = blockIds;
            return currRule;
        }
        /**
        * Passive Rule: Checks if the users has at least one block type for each rule
        * @param usersBlockUsed an array of strings
        * @param tutorialBlockUsed the next available index
        * @param currRule the current rule with its TutorialRuleStatus
        * @return a tutorial rule status for currRule
        */
        function validateAtleastOneBlocks(usersBlockUsed, tutorialBlockUsed, currRule) {
            const userBlockKeys = Object.keys(usersBlockUsed);
            const tutorialBlockKeys = Object.keys(tutorialBlockUsed !== null && tutorialBlockUsed !== void 0 ? tutorialBlockUsed : {});
            let isValid = userBlockKeys.length >= tutorialBlockKeys.length; // user has enough blocks
            for (let i = 0; i < tutorialBlockKeys.length; i++) {
                let tutorialBlockKey = tutorialBlockKeys[i];
                if (!usersBlockUsed[tutorialBlockKey]) { // user did not use a specific block
                    isValid = false;
                    break;
                }
            }
            currRule.ruleStatus = isValid;
            return currRule;
        }
        /**
         * Strict Rule: Checks if the all required number of blocks for a tutorial step is used, returns a TutorialRuleStatus
         * @param usersBlockUsed an array of strings
         * @param tutorialBlockUsed the next available index
         * @param currRule the current rule with its TutorialRuleStatus
         * @return a tutorial rule status for currRule
         */
        function validateMeetRequiredBlocks(usersBlockUsed, requiredBlocks, currRule) {
            currRule.isStrict = true;
            const userBlockKeys = Object.keys(usersBlockUsed);
            let requiredBlockKeys = [];
            let blockIds = [];
            if (requiredBlocks != undefined) {
                requiredBlockKeys = Object.keys(requiredBlocks);
            }
            let isValid = true;
            const message = lf("You are required to have the following block:");
            for (let i = 0; i < requiredBlockKeys.length; i++) {
                let requiredBlockKey = requiredBlockKeys[i];
                if (!usersBlockUsed[requiredBlockKey]) {
                    blockIds.push(requiredBlockKey);
                    isValid = false;
                }
            }
            currRule.ruleMessage = message;
            currRule.ruleStatus = isValid;
            currRule.blockIds = blockIds;
            return currRule;
        }
    })(tutorial = pxt.tutorial || (pxt.tutorial = {}));
})(pxt || (pxt = {}));
/// <reference path='../pxtcompiler/ext-typescript/lib/typescriptServices.d.ts' />
var ts;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        function flattenDiagnosticMessageText(messageText, newLine) {
            if (typeof messageText === "string") {
                return messageText;
            }
            else {
                let diagnosticChain = messageText;
                let result = "";
                let indent = 0;
                while (diagnosticChain) {
                    if (indent) {
                        result += newLine;
                        for (let i = 0; i < indent; i++) {
                            result += "  ";
                        }
                    }
                    result += diagnosticChain.messageText;
                    indent++;
                    diagnosticChain = diagnosticChain.next;
                }
                return result;
            }
        }
        pxtc.flattenDiagnosticMessageText = flattenDiagnosticMessageText;
        let ScriptTarget;
        (function (ScriptTarget) {
            ScriptTarget[ScriptTarget["ES3"] = 0] = "ES3";
            ScriptTarget[ScriptTarget["ES5"] = 1] = "ES5";
            ScriptTarget[ScriptTarget["ES6"] = 2] = "ES6";
            ScriptTarget[ScriptTarget["ES2015"] = 2] = "ES2015";
            ScriptTarget[ScriptTarget["Latest"] = 2] = "Latest";
        })(ScriptTarget = pxtc.ScriptTarget || (pxtc.ScriptTarget = {}));
        function isIdentifierStart(ch, languageVersion) {
            return ch >= 65 /* A */ && ch <= 90 /* Z */ || ch >= 97 /* a */ && ch <= 122 /* z */ ||
                ch === 36 /* $ */ || ch === 95 /* _ */ ||
                ch > 127 /* maxAsciiCharacter */ && isUnicodeIdentifierStart(ch, languageVersion);
        }
        pxtc.isIdentifierStart = isIdentifierStart;
        function isIdentifierPart(ch, languageVersion) {
            return ch >= 65 /* A */ && ch <= 90 /* Z */ || ch >= 97 /* a */ && ch <= 122 /* z */ ||
                ch >= 48 /* _0 */ && ch <= 57 /* _9 */ || ch === 36 /* $ */ || ch === 95 /* _ */ ||
                ch > 127 /* maxAsciiCharacter */ && isUnicodeIdentifierPart(ch, languageVersion);
        }
        pxtc.isIdentifierPart = isIdentifierPart;
        pxtc.reservedWords = ["abstract", "any", "as", "break",
            "case", "catch", "class", "continue", "const", "constructor", "debugger",
            "declare", "default", "delete", "do", "else", "enum", "export", "extends",
            "false", "finally", "for", "from", "function", "get", "if", "implements",
            "import", "in", "instanceof", "interface", "is", "let", "module", "namespace",
            "new", "null", "package", "private", "protected", "public",
            "require", "global", "return", "set", "static", "super", "switch",
            "symbol", "this", "throw", "true", "try", "type", "typeof", "var", "void",
            "while", "with", "yield", "async", "await", "of",
            // PXT Specific
            "Math"];
        pxtc.keywordTypes = ["boolean", "number", "string"];
        function escapeIdentifier(name) {
            if (!name)
                return '_';
            let n = name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_$]/g, a => ts.pxtc.isIdentifierPart(a.charCodeAt(0), ts.pxtc.ScriptTarget.ES5) ? a : "");
            if (!n || !ts.pxtc.isIdentifierStart(n.charCodeAt(0), ts.pxtc.ScriptTarget.ES5) || pxtc.reservedWords.indexOf(n) !== -1) {
                n = "_" + n;
            }
            return n;
        }
        pxtc.escapeIdentifier = escapeIdentifier;
        const unicodeES5IdentifierStart = [170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750, 880, 884, 886, 887, 890, 893, 902, 902, 904, 906, 908, 908, 910, 929, 931, 1013, 1015, 1153, 1162, 1319, 1329, 1366, 1369, 1369, 1377, 1415, 1488, 1514, 1520, 1522, 1568, 1610, 1646, 1647, 1649, 1747, 1749, 1749, 1765, 1766, 1774, 1775, 1786, 1788, 1791, 1791, 1808, 1808, 1810, 1839, 1869, 1957, 1969, 1969, 1994, 2026, 2036, 2037, 2042, 2042, 2048, 2069, 2074, 2074, 2084, 2084, 2088, 2088, 2112, 2136, 2208, 2208, 2210, 2220, 2308, 2361, 2365, 2365, 2384, 2384, 2392, 2401, 2417, 2423, 2425, 2431, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2493, 2493, 2510, 2510, 2524, 2525, 2527, 2529, 2544, 2545, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2649, 2652, 2654, 2654, 2674, 2676, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2749, 2749, 2768, 2768, 2784, 2785, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2869, 2873, 2877, 2877, 2908, 2909, 2911, 2913, 2929, 2929, 2947, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3024, 3024, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123, 3125, 3129, 3133, 3133, 3160, 3161, 3168, 3169, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3261, 3261, 3294, 3294, 3296, 3297, 3313, 3314, 3333, 3340, 3342, 3344, 3346, 3386, 3389, 3389, 3406, 3406, 3424, 3425, 3450, 3455, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3585, 3632, 3634, 3635, 3648, 3654, 3713, 3714, 3716, 3716, 3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743, 3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3760, 3762, 3763, 3773, 3773, 3776, 3780, 3782, 3782, 3804, 3807, 3840, 3840, 3904, 3911, 3913, 3948, 3976, 3980, 4096, 4138, 4159, 4159, 4176, 4181, 4186, 4189, 4193, 4193, 4197, 4198, 4206, 4208, 4213, 4225, 4238, 4238, 4256, 4293, 4295, 4295, 4301, 4301, 4304, 4346, 4348, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880, 4882, 4885, 4888, 4954, 4992, 5007, 5024, 5108, 5121, 5740, 5743, 5759, 5761, 5786, 5792, 5866, 5870, 5872, 5888, 5900, 5902, 5905, 5920, 5937, 5952, 5969, 5984, 5996, 5998, 6000, 6016, 6067, 6103, 6103, 6108, 6108, 6176, 6263, 6272, 6312, 6314, 6314, 6320, 6389, 6400, 6428, 6480, 6509, 6512, 6516, 6528, 6571, 6593, 6599, 6656, 6678, 6688, 6740, 6823, 6823, 6917, 6963, 6981, 6987, 7043, 7072, 7086, 7087, 7098, 7141, 7168, 7203, 7245, 7247, 7258, 7293, 7401, 7404, 7406, 7409, 7413, 7414, 7424, 7615, 7680, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8305, 8305, 8319, 8319, 8336, 8348, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8493, 8495, 8505, 8508, 8511, 8517, 8521, 8526, 8526, 8544, 8584, 11264, 11310, 11312, 11358, 11360, 11492, 11499, 11502, 11506, 11507, 11520, 11557, 11559, 11559, 11565, 11565, 11568, 11623, 11631, 11631, 11648, 11670, 11680, 11686, 11688, 11694, 11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726, 11728, 11734, 11736, 11742, 11823, 11823, 12293, 12295, 12321, 12329, 12337, 12341, 12344, 12348, 12353, 12438, 12445, 12447, 12449, 12538, 12540, 12543, 12549, 12589, 12593, 12686, 12704, 12730, 12784, 12799, 13312, 19893, 19968, 40908, 40960, 42124, 42192, 42237, 42240, 42508, 42512, 42527, 42538, 42539, 42560, 42606, 42623, 42647, 42656, 42735, 42775, 42783, 42786, 42888, 42891, 42894, 42896, 42899, 42912, 42922, 43000, 43009, 43011, 43013, 43015, 43018, 43020, 43042, 43072, 43123, 43138, 43187, 43250, 43255, 43259, 43259, 43274, 43301, 43312, 43334, 43360, 43388, 43396, 43442, 43471, 43471, 43520, 43560, 43584, 43586, 43588, 43595, 43616, 43638, 43642, 43642, 43648, 43695, 43697, 43697, 43701, 43702, 43705, 43709, 43712, 43712, 43714, 43714, 43739, 43741, 43744, 43754, 43762, 43764, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43814, 43816, 43822, 43968, 44002, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64285, 64287, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65136, 65140, 65142, 65276, 65313, 65338, 65345, 65370, 65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500,];
        const unicodeES5IdentifierPart = [170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750, 768, 884, 886, 887, 890, 893, 902, 902, 904, 906, 908, 908, 910, 929, 931, 1013, 1015, 1153, 1155, 1159, 1162, 1319, 1329, 1366, 1369, 1369, 1377, 1415, 1425, 1469, 1471, 1471, 1473, 1474, 1476, 1477, 1479, 1479, 1488, 1514, 1520, 1522, 1552, 1562, 1568, 1641, 1646, 1747, 1749, 1756, 1759, 1768, 1770, 1788, 1791, 1791, 1808, 1866, 1869, 1969, 1984, 2037, 2042, 2042, 2048, 2093, 2112, 2139, 2208, 2208, 2210, 2220, 2276, 2302, 2304, 2403, 2406, 2415, 2417, 2423, 2425, 2431, 2433, 2435, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2525, 2527, 2531, 2534, 2545, 2561, 2563, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2620, 2620, 2622, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2652, 2654, 2654, 2662, 2677, 2689, 2691, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2748, 2757, 2759, 2761, 2763, 2765, 2768, 2768, 2784, 2787, 2790, 2799, 2817, 2819, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2869, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2909, 2911, 2915, 2918, 2927, 2929, 2929, 2946, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3016, 3018, 3021, 3024, 3024, 3031, 3031, 3046, 3055, 3073, 3075, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123, 3125, 3129, 3133, 3140, 3142, 3144, 3146, 3149, 3157, 3158, 3160, 3161, 3168, 3171, 3174, 3183, 3202, 3203, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3260, 3268, 3270, 3272, 3274, 3277, 3285, 3286, 3294, 3294, 3296, 3299, 3302, 3311, 3313, 3314, 3330, 3331, 3333, 3340, 3342, 3344, 3346, 3386, 3389, 3396, 3398, 3400, 3402, 3406, 3415, 3415, 3424, 3427, 3430, 3439, 3450, 3455, 3458, 3459, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3530, 3530, 3535, 3540, 3542, 3542, 3544, 3551, 3570, 3571, 3585, 3642, 3648, 3662, 3664, 3673, 3713, 3714, 3716, 3716, 3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743, 3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3769, 3771, 3773, 3776, 3780, 3782, 3782, 3784, 3789, 3792, 3801, 3804, 3807, 3840, 3840, 3864, 3865, 3872, 3881, 3893, 3893, 3895, 3895, 3897, 3897, 3902, 3911, 3913, 3948, 3953, 3972, 3974, 3991, 3993, 4028, 4038, 4038, 4096, 4169, 4176, 4253, 4256, 4293, 4295, 4295, 4301, 4301, 4304, 4346, 4348, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880, 4882, 4885, 4888, 4954, 4957, 4959, 4992, 5007, 5024, 5108, 5121, 5740, 5743, 5759, 5761, 5786, 5792, 5866, 5870, 5872, 5888, 5900, 5902, 5908, 5920, 5940, 5952, 5971, 5984, 5996, 5998, 6000, 6002, 6003, 6016, 6099, 6103, 6103, 6108, 6109, 6112, 6121, 6155, 6157, 6160, 6169, 6176, 6263, 6272, 6314, 6320, 6389, 6400, 6428, 6432, 6443, 6448, 6459, 6470, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6617, 6656, 6683, 6688, 6750, 6752, 6780, 6783, 6793, 6800, 6809, 6823, 6823, 6912, 6987, 6992, 7001, 7019, 7027, 7040, 7155, 7168, 7223, 7232, 7241, 7245, 7293, 7376, 7378, 7380, 7414, 7424, 7654, 7676, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8204, 8205, 8255, 8256, 8276, 8276, 8305, 8305, 8319, 8319, 8336, 8348, 8400, 8412, 8417, 8417, 8421, 8432, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8493, 8495, 8505, 8508, 8511, 8517, 8521, 8526, 8526, 8544, 8584, 11264, 11310, 11312, 11358, 11360, 11492, 11499, 11507, 11520, 11557, 11559, 11559, 11565, 11565, 11568, 11623, 11631, 11631, 11647, 11670, 11680, 11686, 11688, 11694, 11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726, 11728, 11734, 11736, 11742, 11744, 11775, 11823, 11823, 12293, 12295, 12321, 12335, 12337, 12341, 12344, 12348, 12353, 12438, 12441, 12442, 12445, 12447, 12449, 12538, 12540, 12543, 12549, 12589, 12593, 12686, 12704, 12730, 12784, 12799, 13312, 19893, 19968, 40908, 40960, 42124, 42192, 42237, 42240, 42508, 42512, 42539, 42560, 42607, 42612, 42621, 42623, 42647, 42655, 42737, 42775, 42783, 42786, 42888, 42891, 42894, 42896, 42899, 42912, 42922, 43000, 43047, 43072, 43123, 43136, 43204, 43216, 43225, 43232, 43255, 43259, 43259, 43264, 43309, 43312, 43347, 43360, 43388, 43392, 43456, 43471, 43481, 43520, 43574, 43584, 43597, 43600, 43609, 43616, 43638, 43642, 43643, 43648, 43714, 43739, 43741, 43744, 43759, 43762, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43814, 43816, 43822, 43968, 44010, 44012, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65024, 65039, 65056, 65062, 65075, 65076, 65101, 65103, 65136, 65140, 65142, 65276, 65296, 65305, 65313, 65338, 65343, 65343, 65345, 65370, 65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500,];
        const unicodeES3IdentifierStart = [170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 543, 546, 563, 592, 685, 688, 696, 699, 705, 720, 721, 736, 740, 750, 750, 890, 890, 902, 902, 904, 906, 908, 908, 910, 929, 931, 974, 976, 983, 986, 1011, 1024, 1153, 1164, 1220, 1223, 1224, 1227, 1228, 1232, 1269, 1272, 1273, 1329, 1366, 1369, 1369, 1377, 1415, 1488, 1514, 1520, 1522, 1569, 1594, 1600, 1610, 1649, 1747, 1749, 1749, 1765, 1766, 1786, 1788, 1808, 1808, 1810, 1836, 1920, 1957, 2309, 2361, 2365, 2365, 2384, 2384, 2392, 2401, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2524, 2525, 2527, 2529, 2544, 2545, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2649, 2652, 2654, 2654, 2674, 2676, 2693, 2699, 2701, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2749, 2749, 2768, 2768, 2784, 2784, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2870, 2873, 2877, 2877, 2908, 2909, 2911, 2913, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 2997, 2999, 3001, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123, 3125, 3129, 3168, 3169, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3294, 3294, 3296, 3297, 3333, 3340, 3342, 3344, 3346, 3368, 3370, 3385, 3424, 3425, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3585, 3632, 3634, 3635, 3648, 3654, 3713, 3714, 3716, 3716, 3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743, 3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3760, 3762, 3763, 3773, 3773, 3776, 3780, 3782, 3782, 3804, 3805, 3840, 3840, 3904, 3911, 3913, 3946, 3976, 3979, 4096, 4129, 4131, 4135, 4137, 4138, 4176, 4181, 4256, 4293, 4304, 4342, 4352, 4441, 4447, 4514, 4520, 4601, 4608, 4614, 4616, 4678, 4680, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4742, 4744, 4744, 4746, 4749, 4752, 4782, 4784, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4814, 4816, 4822, 4824, 4846, 4848, 4878, 4880, 4880, 4882, 4885, 4888, 4894, 4896, 4934, 4936, 4954, 5024, 5108, 5121, 5740, 5743, 5750, 5761, 5786, 5792, 5866, 6016, 6067, 6176, 6263, 6272, 6312, 7680, 7835, 7840, 7929, 7936, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8319, 8319, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8493, 8495, 8497, 8499, 8505, 8544, 8579, 12293, 12295, 12321, 12329, 12337, 12341, 12344, 12346, 12353, 12436, 12445, 12446, 12449, 12538, 12540, 12542, 12549, 12588, 12593, 12686, 12704, 12727, 13312, 19893, 19968, 40869, 40960, 42124, 44032, 55203, 63744, 64045, 64256, 64262, 64275, 64279, 64285, 64285, 64287, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65136, 65138, 65140, 65140, 65142, 65276, 65313, 65338, 65345, 65370, 65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500,];
        const unicodeES3IdentifierPart = [170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 543, 546, 563, 592, 685, 688, 696, 699, 705, 720, 721, 736, 740, 750, 750, 768, 846, 864, 866, 890, 890, 902, 902, 904, 906, 908, 908, 910, 929, 931, 974, 976, 983, 986, 1011, 1024, 1153, 1155, 1158, 1164, 1220, 1223, 1224, 1227, 1228, 1232, 1269, 1272, 1273, 1329, 1366, 1369, 1369, 1377, 1415, 1425, 1441, 1443, 1465, 1467, 1469, 1471, 1471, 1473, 1474, 1476, 1476, 1488, 1514, 1520, 1522, 1569, 1594, 1600, 1621, 1632, 1641, 1648, 1747, 1749, 1756, 1759, 1768, 1770, 1773, 1776, 1788, 1808, 1836, 1840, 1866, 1920, 1968, 2305, 2307, 2309, 2361, 2364, 2381, 2384, 2388, 2392, 2403, 2406, 2415, 2433, 2435, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2492, 2492, 2494, 2500, 2503, 2504, 2507, 2509, 2519, 2519, 2524, 2525, 2527, 2531, 2534, 2545, 2562, 2562, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2620, 2620, 2622, 2626, 2631, 2632, 2635, 2637, 2649, 2652, 2654, 2654, 2662, 2676, 2689, 2691, 2693, 2699, 2701, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2748, 2757, 2759, 2761, 2763, 2765, 2768, 2768, 2784, 2784, 2790, 2799, 2817, 2819, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2870, 2873, 2876, 2883, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2909, 2911, 2913, 2918, 2927, 2946, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 2997, 2999, 3001, 3006, 3010, 3014, 3016, 3018, 3021, 3031, 3031, 3047, 3055, 3073, 3075, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123, 3125, 3129, 3134, 3140, 3142, 3144, 3146, 3149, 3157, 3158, 3168, 3169, 3174, 3183, 3202, 3203, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3262, 3268, 3270, 3272, 3274, 3277, 3285, 3286, 3294, 3294, 3296, 3297, 3302, 3311, 3330, 3331, 3333, 3340, 3342, 3344, 3346, 3368, 3370, 3385, 3390, 3395, 3398, 3400, 3402, 3405, 3415, 3415, 3424, 3425, 3430, 3439, 3458, 3459, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3530, 3530, 3535, 3540, 3542, 3542, 3544, 3551, 3570, 3571, 3585, 3642, 3648, 3662, 3664, 3673, 3713, 3714, 3716, 3716, 3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743, 3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3769, 3771, 3773, 3776, 3780, 3782, 3782, 3784, 3789, 3792, 3801, 3804, 3805, 3840, 3840, 3864, 3865, 3872, 3881, 3893, 3893, 3895, 3895, 3897, 3897, 3902, 3911, 3913, 3946, 3953, 3972, 3974, 3979, 3984, 3991, 3993, 4028, 4038, 4038, 4096, 4129, 4131, 4135, 4137, 4138, 4140, 4146, 4150, 4153, 4160, 4169, 4176, 4185, 4256, 4293, 4304, 4342, 4352, 4441, 4447, 4514, 4520, 4601, 4608, 4614, 4616, 4678, 4680, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4742, 4744, 4744, 4746, 4749, 4752, 4782, 4784, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4814, 4816, 4822, 4824, 4846, 4848, 4878, 4880, 4880, 4882, 4885, 4888, 4894, 4896, 4934, 4936, 4954, 4969, 4977, 5024, 5108, 5121, 5740, 5743, 5750, 5761, 5786, 5792, 5866, 6016, 6099, 6112, 6121, 6160, 6169, 6176, 6263, 6272, 6313, 7680, 7835, 7840, 7929, 7936, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8255, 8256, 8319, 8319, 8400, 8412, 8417, 8417, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8493, 8495, 8497, 8499, 8505, 8544, 8579, 12293, 12295, 12321, 12335, 12337, 12341, 12344, 12346, 12353, 12436, 12441, 12442, 12445, 12446, 12449, 12542, 12549, 12588, 12593, 12686, 12704, 12727, 13312, 19893, 19968, 40869, 40960, 42124, 44032, 55203, 63744, 64045, 64256, 64262, 64275, 64279, 64285, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65056, 65059, 65075, 65076, 65101, 65103, 65136, 65138, 65140, 65140, 65142, 65276, 65296, 65305, 65313, 65338, 65343, 65343, 65345, 65370, 65381, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500,];
        function isUnicodeIdentifierStart(code, languageVersion) {
            return languageVersion >= ScriptTarget.ES5 ?
                lookupInUnicodeMap(code, unicodeES5IdentifierStart) :
                lookupInUnicodeMap(code, unicodeES3IdentifierStart);
        }
        pxtc.isUnicodeIdentifierStart = isUnicodeIdentifierStart;
        function isUnicodeIdentifierPart(code, languageVersion) {
            return languageVersion >= ScriptTarget.ES5 ?
                lookupInUnicodeMap(code, unicodeES5IdentifierPart) :
                lookupInUnicodeMap(code, unicodeES3IdentifierPart);
        }
        function lookupInUnicodeMap(code, map) {
            // Bail out quickly if it couldn't possibly be in the map.
            if (code < map[0]) {
                return false;
            }
            // Perform binary search in one of the Unicode range maps
            let lo = 0;
            let hi = map.length;
            let mid;
            while (lo + 1 < hi) {
                mid = lo + (hi - lo) / 2;
                // mid has to be even to catch a range's beginning
                mid -= mid % 2;
                if (map[mid] <= code && code <= map[mid + 1]) {
                    return true;
                }
                if (code < map[mid]) {
                    hi = mid;
                }
                else {
                    lo = mid + 2;
                }
            }
            return false;
        }
        let DiagnosticCategory;
        (function (DiagnosticCategory) {
            DiagnosticCategory[DiagnosticCategory["Warning"] = 0] = "Warning";
            DiagnosticCategory[DiagnosticCategory["Error"] = 1] = "Error";
            DiagnosticCategory[DiagnosticCategory["Message"] = 2] = "Message";
        })(DiagnosticCategory = pxtc.DiagnosticCategory || (pxtc.DiagnosticCategory = {}));
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
var pxt;
(function (pxt) {
    var webBluetooth;
    (function (webBluetooth) {
        function isAvailable() {
            return hasConsole() || hasPartialFlash();
        }
        webBluetooth.isAvailable = isAvailable;
        function hasConsole() {
            return !!navigator && !!navigator.bluetooth
                && ('TextDecoder' in window) // needed for reading data
                && pxt.appTarget.appTheme.bluetoothUartConsole
                && pxt.appTarget.appTheme.bluetoothUartFilters
                && pxt.appTarget.appTheme.bluetoothUartFilters.length > 0;
        }
        webBluetooth.hasConsole = hasConsole;
        function hasPartialFlash() {
            return !!navigator && !!navigator.bluetooth
                && !!pxt.appTarget.appTheme.bluetoothPartialFlashing;
        }
        webBluetooth.hasPartialFlash = hasPartialFlash;
        function isValidUUID(id) {
            // https://webbluetoothcg.github.io/web-bluetooth/#uuids
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
        }
        webBluetooth.isValidUUID = isValidUUID;
        class BLERemote {
            constructor(id, aliveToken) {
                this.connectionTimeout = 20000; // 20 second default timeout
                this.connectPromise = undefined;
                this.id = id;
                this.aliveToken = aliveToken;
            }
            debug(msg) {
                pxt.debug(`${this.id}: ${msg}`);
            }
            alivePromise(p) {
                return new Promise((resolve, reject) => {
                    if (this.aliveToken.isCancelled())
                        reject(new Error());
                    p.then(r => resolve(r), e => reject(e));
                });
            }
            cancelConnect() {
                this.connectPromise = undefined;
            }
            createConnectPromise() {
                return Promise.resolve();
            }
            connectAsync() {
                if (!this.connectPromise)
                    this.connectPromise = this.alivePromise(this.createConnectPromise());
                return pxt.Util.promiseTimeout(this.connectionTimeout, this.connectPromise, "connection timeout")
                    .then(() => this.aliveToken.throwIfCancelled())
                    .catch(e => {
                    // connection failed, clear promise to try again
                    this.connectPromise = undefined;
                    throw e;
                });
            }
            disconnect() {
                this.cancelConnect();
            }
            kill() {
                this.disconnect();
                this.aliveToken.cancel();
            }
        }
        webBluetooth.BLERemote = BLERemote;
        class BLEService extends BLERemote {
            constructor(id, device, autoReconnect) {
                super(id, device.aliveToken);
                this.device = device;
                this.autoReconnect = autoReconnect;
                this.autoReconnectDelay = 1000;
                this.disconnectOnAutoReconnect = false;
                this.reconnectPromise = undefined;
                this.failedConnectionServicesVersion = -1;
                this.handleDisconnected = this.handleDisconnected.bind(this);
                this.device.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
            }
            handleDisconnected(event) {
                if (this.aliveToken.isCancelled())
                    return;
                this.disconnect();
                // give a 1sec for device to reboot
                if (this.autoReconnect && !this.reconnectPromise)
                    this.reconnectPromise =
                        pxt.U.delay(this.autoReconnectDelay)
                            .then(() => this.exponentialBackoffConnectAsync(8, 500))
                            .finally(() => this.reconnectPromise = undefined);
            }
            /* Utils */
            // This function keeps calling "toTry" until promise resolves or has
            // retried "max" number of times. First retry has a delay of "delay" seconds.
            // "success" is called upon success.
            exponentialBackoffConnectAsync(max, delay) {
                this.debug(`retry connect`);
                this.aliveToken.throwIfCancelled();
                return this.connectAsync()
                    .then(() => {
                    this.aliveToken.throwIfCancelled();
                    this.debug(`reconnect success`);
                    this.reconnectPromise = undefined;
                })
                    .catch(e => {
                    this.debug(`reconnect error ${e.message}`);
                    this.aliveToken.throwIfCancelled();
                    if (!this.device.isPaired) {
                        this.debug(`give up, device unpaired`);
                        this.reconnectPromise = undefined;
                        return undefined;
                    }
                    if (!this.autoReconnect) {
                        this.debug(`autoreconnect disabled`);
                        this.reconnectPromise = undefined;
                        return undefined;
                    }
                    if (max == 0) {
                        this.debug(`give up, max tries`);
                        this.reconnectPromise = undefined;
                        return undefined; // give up
                    }
                    // did we already try to reconnect with the current state of services?
                    if (this.failedConnectionServicesVersion == this.device.servicesVersion) {
                        this.debug(`services haven't changed, giving up`);
                        this.reconnectPromise = undefined;
                        return undefined;
                    }
                    this.debug(`retry connect ${delay}ms... (${max} tries left)`);
                    // record service version if connected
                    if (this.device.connected)
                        this.failedConnectionServicesVersion = this.device.servicesVersion;
                    if (this.disconnectOnAutoReconnect)
                        this.device.disconnect();
                    return pxt.U.delay(delay)
                        .then(() => this.exponentialBackoffConnectAsync(--max, delay * 1.8));
                });
            }
        }
        webBluetooth.BLEService = BLEService;
        class BLETXService extends BLEService {
            constructor(id, device, serviceUUID, txCharacteristicUUID) {
                super(id, device, true);
                this.device = device;
                this.serviceUUID = serviceUUID;
                this.txCharacteristicUUID = txCharacteristicUUID;
                this.handleValueChanged = this.handleValueChanged.bind(this);
            }
            createConnectPromise() {
                this.debug(`connecting`);
                return this.device.connectAsync()
                    .then(() => this.alivePromise(this.device.gatt.getPrimaryService(this.serviceUUID)))
                    .then(service => {
                    this.debug(`service connected`);
                    this.service = service;
                    return this.alivePromise(this.service.getCharacteristic(this.txCharacteristicUUID));
                }).then(txCharacteristic => {
                    this.debug(`tx characteristic connected`);
                    this.txCharacteristic = txCharacteristic;
                    this.txCharacteristic.addEventListener('characteristicvaluechanged', this.handleValueChanged);
                    return this.txCharacteristic.startNotifications();
                }).then(() => {
                    pxt.tickEvent(`webble.connected`, { id: this.id });
                });
            }
            handlePacket(data) {
            }
            handleValueChanged(event) {
                const dataView = event.target.value;
                this.handlePacket(dataView);
            }
            disconnect() {
                super.disconnect();
                if (this.txCharacteristic && this.device && this.device.connected) {
                    try {
                        this.txCharacteristic.stopNotifications();
                        this.txCharacteristic.removeEventListener('characteristicvaluechanged', this.handleValueChanged);
                    }
                    catch (e) {
                        pxt.log(`${this.id}: error ${e.message}`);
                    }
                }
                this.service = undefined;
                this.txCharacteristic = undefined;
            }
        }
        webBluetooth.BLETXService = BLETXService;
        class HF2Service extends BLETXService {
            constructor(device) {
                super("hf2", device, HF2Service.SERVICE_UUID, HF2Service.CHARACTERISTIC_TX_UUID);
                this.device = device;
            }
            handlePacket(data) {
                const cmd = data.getUint8(0);
                switch (cmd & 0xc0) {
                    case HF2Service.BLEHF2_FLAG_SERIAL_OUT:
                    case HF2Service.BLEHF2_FLAG_SERIAL_ERR:
                        const n = Math.min(data.byteLength - 1, cmd & ~0xc0); // length in bytes
                        let text = "";
                        for (let i = 0; i < n; ++i)
                            text += String.fromCharCode(data.getUint8(i + 1));
                        if (text) {
                            window.postMessage({
                                type: "serial",
                                id: this.device.name || "hf2",
                                data: text
                            }, "*");
                        }
                        break;
                }
            }
        }
        HF2Service.SERVICE_UUID = 'b112f5e6-2679-30da-a26e-0273b6043849';
        HF2Service.CHARACTERISTIC_TX_UUID = 'b112f5e6-2679-30da-a26e-0273b604384a';
        HF2Service.BLEHF2_FLAG_SERIAL_OUT = 0x80;
        HF2Service.BLEHF2_FLAG_SERIAL_ERR = 0xC0;
        webBluetooth.HF2Service = HF2Service;
        class UARTService extends BLETXService {
            constructor(device) {
                super("uart", device, UARTService.SERVICE_UUID, UARTService.CHARACTERISTIC_TX_UUID);
                this.device = device;
            }
            handlePacket(data) {
                const decoder = new window.TextDecoder();
                const text = decoder.decode(data);
                if (text) {
                    window.postMessage({
                        type: "serial",
                        id: this.device.name || "uart",
                        data: text
                    }, "*");
                }
            }
        }
        // Nordic UART BLE service
        UARTService.SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'; // must be lower case!
        UARTService.CHARACTERISTIC_TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
        webBluetooth.UARTService = UARTService;
        let PartialFlashingState;
        (function (PartialFlashingState) {
            PartialFlashingState[PartialFlashingState["Idle"] = 1] = "Idle";
            PartialFlashingState[PartialFlashingState["StatusRequested"] = 2] = "StatusRequested";
            PartialFlashingState[PartialFlashingState["PairingModeRequested"] = 4] = "PairingModeRequested";
            PartialFlashingState[PartialFlashingState["RegionDALRequested"] = 8] = "RegionDALRequested";
            PartialFlashingState[PartialFlashingState["RegionMakeCodeRequested"] = 16] = "RegionMakeCodeRequested";
            PartialFlashingState[PartialFlashingState["Flash"] = 32] = "Flash";
            PartialFlashingState[PartialFlashingState["EndOfTransmision"] = 64] = "EndOfTransmision";
            PartialFlashingState[PartialFlashingState["USBFlashRequired"] = 128] = "USBFlashRequired";
        })(PartialFlashingState || (PartialFlashingState = {}));
        // https://github.com/microbit-sam/microbit-docs/blob/master/docs/ble/partial-flashing-service.md
        class PartialFlashingService extends BLEService {
            constructor(device) {
                super("partial flashing", device, false);
                this.device = device;
                this.state = PartialFlashingState.Idle;
                this.disconnectOnAutoReconnect = true;
                this.handleCharacteristic = this.handleCharacteristic.bind(this);
            }
            clearFlashData() {
                this.version = 0;
                this.mode = 0;
                this.regions = [];
                this.chunkDelay = PartialFlashingService.CHUNK_MIN_DELAY;
                this.hex = undefined;
                this.bin = undefined;
                this.magicOffset = undefined;
                this.dalHash = undefined;
                this.makeCodeHash = undefined;
                this.flashReject = undefined;
                this.flashResolve = undefined;
                this.flashOffset = undefined;
            }
            createConnectPromise() {
                this.debug(`connecting to partial flash service`);
                return this.device.connectAsync()
                    .then(() => this.alivePromise(this.device.gatt.getPrimaryService(PartialFlashingService.SERVICE_UUID)))
                    .then(service => {
                    this.debug(`connecting to characteristic`);
                    return this.alivePromise(service.getCharacteristic(PartialFlashingService.CHARACTERISTIC_UUID));
                }).then(characteristic => {
                    this.debug(`starting notifications`);
                    this.pfCharacteristic = characteristic;
                    this.pfCharacteristic.startNotifications();
                    this.pfCharacteristic.addEventListener('characteristicvaluechanged', this.handleCharacteristic);
                    // looks like we asked the device to reconnect in pairing mode,
                    // let's see if that worked out
                    if (this.state == PartialFlashingState.PairingModeRequested) {
                        this.debug(`checking pairing mode`);
                        this.autoReconnect = false;
                        return this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.STATUS]));
                    }
                    return Promise.resolve();
                });
            }
            disconnect() {
                super.disconnect();
                if (this.flashPacketToken)
                    this.flashPacketToken.cancel();
                if (this.pfCharacteristic && this.device.connected) {
                    try {
                        this.pfCharacteristic.stopNotifications();
                        this.pfCharacteristic.removeEventListener('characteristicvaluechanged', this.handleCharacteristic);
                    }
                    catch (e) {
                        pxt.log(`ble: partial flash disconnect error ${e.message}`);
                    }
                }
                this.pfCharacteristic = undefined;
            }
            // finds block starting with MAGIC_BLOCK
            findMarker(offset, marker) {
                if (!this.bin)
                    return -1;
                for (; offset + marker.length < this.bin.length; offset += 16) {
                    let match = true;
                    for (let j = 0; j < marker.length; ++j) {
                        if (marker[j] != this.bin[offset + j]) {
                            match = false;
                            break;
                        }
                    }
                    if (match)
                        return offset;
                }
                return -1;
            }
            flashAsync(hex) {
                if (this.hex) {
                    this.debug(`flashing already in progress`);
                    return Promise.resolve();
                }
                this.device.pauseLog();
                return this.createFlashPromise(hex)
                    .finally(() => this.device.resumeLogOnDisconnection());
            }
            createFlashPromise(hex) {
                if (this.hex) {
                    this.debug(`flashing already in progress`);
                    return Promise.resolve();
                }
                this.clearFlashData();
                this.hex = hex;
                const uf2 = ts.pxtc.UF2.newBlockFile();
                ts.pxtc.UF2.writeHex(uf2, this.hex.split(/\r?\n/));
                const flashUsableEnd = pxt.appTarget.compile.flashUsableEnd;
                this.bin = ts.pxtc.UF2.toBin(pxt.U.stringToUint8Array(ts.pxtc.UF2.serializeFile(uf2)), flashUsableEnd).buf;
                this.debug(`bin bytes ${this.bin.length}`);
                this.magicOffset = this.findMarker(0, PartialFlashingService.MAGIC_MARKER);
                this.debug(`magic block ${this.magicOffset.toString(16)}`);
                if (this.magicOffset < 0) {
                    this.debug(`magic block not found, not a valid HEX file`);
                    pxt.U.userError(lf("Invalid file"));
                }
                this.debug(`bytes to flash ${this.bin.length - this.magicOffset}`);
                // magic + 16bytes = hash
                const hashOffset = this.magicOffset + PartialFlashingService.MAGIC_MARKER.length;
                this.dalHash = pxt.Util.toHex(this.bin.slice(hashOffset, hashOffset + 8));
                this.makeCodeHash = pxt.Util.toHex(this.bin.slice(hashOffset + 8, hashOffset + 16));
                this.debug(`DAL hash ${this.dalHash}`);
                this.debug(`MakeCode hash ${this.makeCodeHash}`);
                return this.connectAsync()
                    .then(() => new Promise((resolve, reject) => {
                    this.flashResolve = resolve;
                    this.flashReject = reject;
                    this.debug(`check service version`);
                    this.state = PartialFlashingState.StatusRequested;
                    return this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.STATUS]));
                })).then(() => { }, e => {
                    pxt.log(`pf: error ${e.message}`);
                    this.clearFlashData();
                });
            }
            checkStateTransition(cmd, acceptedStates) {
                if (!(this.state & acceptedStates)) {
                    this.debug(`flash cmd ${cmd} in state ${this.state.toString(16)} `);
                    this.flashReject(new Error());
                    this.clearFlashData();
                    return false;
                }
                return true;
            }
            handleCharacteristic(ev) {
                // check service is still alive
                if (this.aliveToken.isCancelled()) {
                    this.flashReject(new Error());
                    this.clearFlashData();
                }
                const dataView = event.target.value;
                const packet = new Uint8Array(dataView.buffer);
                const cmd = packet[0];
                //this.debug(`flash state ${this.state} - cmd ${cmd}`);
                if (this.state == PartialFlashingState.Idle) // rogue response
                    return;
                switch (cmd) {
                    case PartialFlashingService.STATUS:
                        if (!this.checkStateTransition(cmd, PartialFlashingState.StatusRequested | PartialFlashingState.PairingModeRequested))
                            return;
                        this.version = packet[1];
                        this.mode = packet[2];
                        this.debug(`flash service version ${this.version} mode ${this.mode}`);
                        this.debug(`reading DAL region`);
                        this.state = PartialFlashingState.RegionDALRequested;
                        this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.REGION_INFO, PartialFlashingService.REGION_DAL]))
                            .then(() => { });
                        break;
                    case PartialFlashingService.REGION_INFO:
                        if (!this.checkStateTransition(cmd, PartialFlashingState.RegionDALRequested | PartialFlashingState.RegionMakeCodeRequested))
                            return;
                        const region = this.regions[packet[1]] = {
                            start: (packet[2] << 24) | (packet[3] << 16) | (packet[4] << 8) | packet[5],
                            end: (packet[6] << 24) | (packet[7] << 16) | (packet[8] << 8) | packet[9],
                            hash: pxt.Util.toHex(packet.slice(10))
                        };
                        this.debug(`read region ${packet[1]} start ${region.start.toString(16)} end ${region.end.toString(16)} hash ${region.hash}`);
                        if (packet[1] == PartialFlashingService.REGION_DAL) {
                            if (region.hash != this.dalHash) {
                                pxt.tickEvent("webble.flash.DALrequired");
                                this.debug(`DAL hash does not match, partial flashing not possible`);
                                this.state = PartialFlashingState.USBFlashRequired;
                                this.flashReject(new Error("USB flashing required"));
                                this.clearFlashData();
                                return;
                            }
                            this.debug(`DAL hash match, reading makecode region`);
                            this.state = PartialFlashingState.RegionMakeCodeRequested;
                            this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.REGION_INFO, PartialFlashingService.REGION_MAKECODE]))
                                .then(() => { });
                        }
                        else if (packet[1] == PartialFlashingService.REGION_MAKECODE) {
                            if (region.start != this.magicOffset) {
                                this.debug(`magic offset and MakeCode region.start not matching`);
                                pxt.U.userError(lf("Invalid file"));
                            }
                            if (region.hash == this.makeCodeHash) {
                                pxt.tickEvent("webble.flash.noop");
                                this.debug(`MakeCode hash matches, same code!`);
                                // always restart even to match USB drag and drop behavior
                                this.debug(`restart application mode`);
                                this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.RESET, PartialFlashingService.MODE_APPLICATION]))
                                    .then(() => {
                                    this.state = PartialFlashingState.Idle;
                                    this.flashResolve();
                                    this.clearFlashData();
                                });
                            }
                            else {
                                // must be in pairing mode
                                if (this.mode != PartialFlashingService.MODE_PAIRING) {
                                    this.debug(`application mode, reset into pairing mode`);
                                    this.state = PartialFlashingState.PairingModeRequested;
                                    this.autoReconnect = true;
                                    this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.RESET, PartialFlashingService.MODE_PAIRING]))
                                        .then(() => { });
                                    return;
                                }
                                // ready to flash the data in 4 chunks
                                this.flashOffset = region.start;
                                this.flashPacketNumber = 0;
                                this.debug(`starting to flash from address ${this.flashOffset.toString(16)}`);
                                this.flashNextPacket();
                            }
                        }
                        break;
                    case PartialFlashingService.FLASH_DATA:
                        if (!this.checkStateTransition(cmd, PartialFlashingState.Flash))
                            return;
                        switch (packet[1]) {
                            case PartialFlashingService.PACKET_OUT_OF_ORDER:
                                this.debug(`packet out of order`);
                                this.flashPacketToken.cancel(); // cancel pending writes
                                this.flashPacketNumber += 4;
                                this.chunkDelay = Math.min(this.chunkDelay + 10, PartialFlashingService.CHUNK_MAX_DELAY);
                                this.flashNextPacket();
                                break;
                            case PartialFlashingService.PACKET_WRITTEN:
                                this.chunkDelay = Math.max(this.chunkDelay - 1, PartialFlashingService.CHUNK_MIN_DELAY);
                                // move cursor
                                this.flashOffset += 64;
                                this.flashPacketNumber += 4;
                                if (this.flashOffset >= this.bin.length) {
                                    this.debug('end transmission');
                                    this.state = PartialFlashingState.EndOfTransmision;
                                    this.pfCharacteristic.writeValue(new Uint8Array([PartialFlashingService.END_OF_TRANSMISSION]))
                                        .finally(() => {
                                        // we are done!
                                        if (this.flashResolve)
                                            this.flashResolve();
                                        this.clearFlashData();
                                    });
                                }
                                else { // keep flashing
                                    this.flashNextPacket();
                                }
                                break;
                        }
                        break;
                    default:
                        this.debug(`unknown message ${pxt.Util.toHex(packet)}`);
                        this.disconnect();
                        break;
                }
            }
            // send 64bytes in 4 BLE packets
            flashNextPacket() {
                this.state = PartialFlashingState.Flash;
                this.flashPacketToken = new pxt.Util.CancellationToken();
                this.flashPacketToken.startOperation();
                const hex = this.bin.slice(this.flashOffset, this.flashOffset + 64);
                this.debug(`flashing ${this.flashOffset.toString(16)} / ${this.bin.length.toString(16)} ${((this.flashOffset - this.magicOffset) / (this.bin.length - this.magicOffset) * 100) >> 0}%`);
                // add delays or chrome crashes
                let chunk = new Uint8Array(20);
                pxt.U.delay(this.chunkDelay)
                    .then(() => {
                    this.flashPacketToken.throwIfCancelled();
                    chunk[0] = PartialFlashingService.FLASH_DATA;
                    chunk[1] = (this.flashOffset >> 8) & 0xff;
                    chunk[2] = (this.flashOffset >> 0) & 0xff;
                    chunk[3] = this.flashPacketNumber; // packet number
                    for (let i = 0; i < 16; i++)
                        chunk[4 + i] = hex[i];
                    //this.debug(`chunk 0 ${Util.toHex(chunk)}`)
                    return this.pfCharacteristic.writeValue(chunk);
                })
                    .then(() => pxt.U.delay(this.chunkDelay))
                    .then(() => {
                    this.flashPacketToken.throwIfCancelled();
                    chunk[0] = PartialFlashingService.FLASH_DATA;
                    chunk[1] = (this.flashOffset >> 24) & 0xff;
                    chunk[2] = (this.flashOffset >> 16) & 0xff;
                    chunk[3] = this.flashPacketNumber + 1; // packet number
                    for (let i = 0; i < 16; i++)
                        chunk[4 + i] = hex[16 + i] || 0;
                    //this.debug(`chunk 1 ${Util.toHex(chunk)}`)
                    return this.pfCharacteristic.writeValue(chunk);
                })
                    .then(() => pxt.U.delay(this.chunkDelay))
                    .then(() => {
                    this.flashPacketToken.throwIfCancelled();
                    chunk[0] = PartialFlashingService.FLASH_DATA;
                    chunk[1] = 0;
                    chunk[2] = 0;
                    chunk[3] = this.flashPacketNumber + 2; // packet number
                    for (let i = 0; i < 16; i++)
                        chunk[4 + i] = hex[32 + i] || 0;
                    //this.debug(`chunk 2 ${Util.toHex(chunk)}`)
                    return this.pfCharacteristic.writeValue(chunk);
                })
                    .then(() => pxt.U.delay(this.chunkDelay))
                    .then(() => {
                    this.flashPacketToken.throwIfCancelled();
                    chunk[0] = PartialFlashingService.FLASH_DATA;
                    chunk[1] = 0;
                    chunk[2] = 0;
                    chunk[3] = this.flashPacketNumber + 3; // packet number
                    for (let i = 0; i < 16; i++)
                        chunk[4 + i] = hex[48 + i] || 0;
                    //this.debug(`chunk 3 ${Util.toHex(chunk)}`)
                    return this.pfCharacteristic.writeValue(chunk);
                }).then(() => {
                    // give 500ms (A LOT) to process packet or consider the protocol stuck
                    // and send a bogus package to trigger an out of order situations
                    const currentFlashOffset = this.flashOffset;
                    const transferDaemonAsync = () => {
                        return pxt.U.delay(500)
                            .then(() => {
                            // are we stuck?
                            if (currentFlashOffset != this.flashOffset // transfer ok
                                || this.flashPacketToken.isCancelled() // transfer cancelled
                                || this.aliveToken.isCancelled() // service is closed
                                || this.state != PartialFlashingState.Flash // flash state changed
                            )
                                return Promise.resolve();
                            // we are definitely stuck
                            this.debug(`packet transfer deadlock, force restart`);
                            chunk[0] = PartialFlashingService.FLASH_DATA;
                            chunk[1] = 0;
                            chunk[2] = 0;
                            chunk[3] = ~0; // bobus packet number
                            for (let i = 0; i < 16; i++)
                                chunk[4 + i] = 0;
                            return this.pfCharacteristic.writeValue(chunk)
                                .then(() => transferDaemonAsync());
                        });
                    };
                    transferDaemonAsync()
                        .catch(e => {
                        // something went clearly wrong
                        if (this.flashReject) {
                            this.flashReject(new Error("failed packet transfer"));
                            this.clearFlashData();
                        }
                    });
                }).catch(() => {
                    this.flashPacketToken.resolveCancel();
                });
            }
        }
        PartialFlashingService.SERVICE_UUID = 'e97dd91d-251d-470a-a062-fa1922dfa9a8';
        PartialFlashingService.CHARACTERISTIC_UUID = 'e97d3b10-251d-470a-a062-fa1922dfa9a8';
        PartialFlashingService.REGION_INFO = 0x00;
        PartialFlashingService.FLASH_DATA = 0x01;
        PartialFlashingService.PACKET_OUT_OF_ORDER = 0xAA;
        PartialFlashingService.PACKET_WRITTEN = 0xFF;
        PartialFlashingService.END_OF_TRANSMISSION = 0x02;
        PartialFlashingService.STATUS = 0xEE;
        PartialFlashingService.RESET = 0xFF;
        PartialFlashingService.MODE_PAIRING = 0;
        PartialFlashingService.MODE_APPLICATION = 0x01;
        PartialFlashingService.REGION_SOFTDEVICE = 0x00;
        PartialFlashingService.REGION_DAL = 0x01;
        PartialFlashingService.REGION_MAKECODE = 0x02;
        PartialFlashingService.MAGIC_MARKER = pxt.Util.fromHex('708E3B92C615A841C49866C975EE5197');
        PartialFlashingService.CHUNK_MIN_DELAY = 0;
        PartialFlashingService.CHUNK_MAX_DELAY = 75;
        webBluetooth.PartialFlashingService = PartialFlashingService;
        class BLEDevice extends BLERemote {
            constructor(device) {
                super("ble", new pxt.Util.CancellationToken());
                this.device = undefined;
                this.services = [];
                this.pendingResumeLogOnDisconnection = false;
                this.servicesVersion = 0;
                this.device = device;
                this.handleDisconnected = this.handleDisconnected.bind(this);
                this.handleServiceAdded = this.handleServiceAdded.bind(this);
                this.handleServiceChanged = this.handleServiceChanged.bind(this);
                this.handleServiceRemoved = this.handleServiceRemoved.bind(this);
                this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
                this.device.addEventListener('serviceadded', this.handleServiceAdded);
                this.device.addEventListener('servicechanged', this.handleServiceChanged);
                this.device.addEventListener('serviceremoved', this.handleServiceRemoved);
                if (hasConsole()) {
                    this.services.push(this.uartService = new UARTService(this));
                    this.services.push(this.hf2Service = new HF2Service(this));
                }
                if (hasPartialFlash())
                    this.services.push(this.partialFlashingService = new PartialFlashingService(this));
                this.aliveToken.startOperation();
            }
            startServices() {
                this.services.filter(service => service.autoReconnect)
                    .forEach(service => service.connectAsync().catch(() => { }));
            }
            pauseLog() {
                if (this.uartService) {
                    this.uartService.autoReconnect = false;
                    this.uartService.disconnect();
                }
                if (this.hf2Service) {
                    this.hf2Service.autoReconnect = false;
                    this.hf2Service.disconnect();
                }
            }
            resumeLogOnDisconnection() {
                this.pendingResumeLogOnDisconnection = true;
            }
            resumeLog() {
                if (this.uartService) {
                    this.uartService.autoReconnect = true;
                    this.uartService.connectAsync().catch(() => { });
                }
                if (this.hf2Service) {
                    this.hf2Service.autoReconnect = true;
                    this.hf2Service.connectAsync().catch(() => { });
                }
            }
            get isPaired() {
                return this === webBluetooth.bleDevice;
            }
            get name() {
                return this.device.name || "?";
            }
            get connected() {
                return this.device && this.device.gatt && this.device.gatt.connected;
            }
            get gatt() {
                return this.device.gatt;
            }
            createConnectPromise() {
                this.debug(`connecting gatt server`);
                return this.alivePromise(this.device.gatt.connect()
                    .then(() => this.debug(`gatt server connected`)));
            }
            handleServiceAdded(event) {
                this.debug(`service added`);
                this.servicesVersion++;
            }
            handleServiceRemoved(event) {
                this.debug(`service removed`);
                this.servicesVersion++;
            }
            handleServiceChanged(event) {
                this.debug(`service changed`);
                this.servicesVersion++;
            }
            handleDisconnected(event) {
                this.debug(`disconnected`);
                this.disconnect();
                if (this.pendingResumeLogOnDisconnection) {
                    this.pendingResumeLogOnDisconnection = false;
                    pxt.U.delay(500).then(() => this.resumeLog());
                }
            }
            disconnect() {
                super.disconnect();
                this.services.forEach(service => service.disconnect());
                if (!this.connected)
                    return;
                this.debug(`disconnect`);
                try {
                    if (this.device.gatt && this.device.gatt.connected)
                        this.device.gatt.disconnect();
                }
                catch (e) {
                    this.debug(`gatt disconnect error ${e.message}`);
                }
            }
        }
        webBluetooth.BLEDevice = BLEDevice;
        webBluetooth.bleDevice = undefined;
        function connectAsync() {
            if (webBluetooth.bleDevice)
                return Promise.resolve();
            pxt.log(`ble: requesting device`);
            const optionalServices = [];
            if (hasConsole()) {
                optionalServices.push(UARTService.SERVICE_UUID);
                optionalServices.push(HF2Service.SERVICE_UUID);
            }
            if (hasPartialFlash())
                optionalServices.push(PartialFlashingService.SERVICE_UUID);
            return navigator.bluetooth.requestDevice({
                filters: pxt.appTarget.appTheme.bluetoothUartFilters,
                optionalServices
            }).then(device => {
                pxt.log(`ble: received device ${device.name}`);
                webBluetooth.bleDevice = new BLEDevice(device);
                webBluetooth.bleDevice.startServices(); // some services have rety logic even if the first GATT connect fails
                return webBluetooth.bleDevice.connectAsync();
            });
        }
        function isPaired() {
            return !!webBluetooth.bleDevice;
        }
        webBluetooth.isPaired = isPaired;
        function pairAsync() {
            if (webBluetooth.bleDevice) {
                webBluetooth.bleDevice.kill();
                webBluetooth.bleDevice = undefined;
            }
            return connectAsync()
                .catch(e => {
                if (webBluetooth.bleDevice && webBluetooth.bleDevice.aliveToken)
                    webBluetooth.bleDevice.aliveToken.resolveCancel();
                pxt.log(`ble: error ${e.message}`);
            });
        }
        webBluetooth.pairAsync = pairAsync;
        function flashAsync(resp, d) {
            pxt.tickEvent("webble.flash");
            const hex = resp.outfiles[ts.pxtc.BINARY_HEX];
            return connectAsync()
                .then(() => webBluetooth.bleDevice.partialFlashingService.flashAsync(hex))
                .then(() => pxt.tickEvent("webble.flash.success"))
                .catch(e => {
                pxt.tickEvent("webble.fail.fail", { "message": e.message });
                throw e;
            });
        }
        webBluetooth.flashAsync = flashAsync;
    })(webBluetooth = pxt.webBluetooth || (pxt.webBluetooth = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var usb;
    (function (usb) {
        class USBError extends Error {
            constructor(msg) {
                super(msg);
                this.message = msg;
            }
        }
        usb.USBError = USBError;
        const controlTransferGetReport = 0x01;
        const controlTransferSetReport = 0x09;
        const controlTransferOutReport = 0x200;
        const controlTransferInReport = 0x100;
        // this is for HF2
        usb.filters = [{
                classCode: 255,
                subclassCode: 42,
            }
        ];
        let isHF2 = true;
        function setFilters(f) {
            isHF2 = false;
            usb.filters = f;
        }
        usb.setFilters = setFilters;
        ;
        ;
        ;
        class WebUSBHID {
            constructor() {
                this.ready = false;
                this.connecting = false;
                this.readLoopStarted = false;
                this.onDeviceConnectionChanged = (connect) => { };
                this.onConnectionChanged = () => { };
                this.onData = (v) => { };
                this.onError = (e) => { };
                this.onEvent = (v) => { };
                this.enabled = false;
                this.handleUSBConnected = this.handleUSBConnected.bind(this);
                this.handleUSBDisconnected = this.handleUSBDisconnected.bind(this);
            }
            enable() {
                if (this.enabled)
                    return;
                this.enabled = true;
                this.log("registering webusb events");
                navigator.usb.addEventListener('disconnect', this.handleUSBDisconnected, false);
                navigator.usb.addEventListener('connect', this.handleUSBConnected, false);
            }
            disable() {
                if (!this.enabled)
                    return;
                this.enabled = false;
                this.log(`unregistering webusb events`);
                navigator.usb.removeEventListener('disconnect', this.handleUSBDisconnected);
                navigator.usb.removeEventListener('connect', this.handleUSBConnected);
            }
            disposeAsync() {
                this.disable();
                return Promise.resolve();
            }
            handleUSBDisconnected(event) {
                this.log("device disconnected");
                if (event.device == this.dev) {
                    this.log("clear device");
                    this.clearDev();
                    if (this.onDeviceConnectionChanged)
                        this.onDeviceConnectionChanged(false);
                }
            }
            handleUSBConnected(event) {
                const newdev = event.device;
                this.log(`device connected ${newdev.serialNumber}`);
                if (!this.dev && !this.connecting) {
                    this.log("attach device");
                    if (this.onDeviceConnectionChanged)
                        this.onDeviceConnectionChanged(true);
                }
            }
            clearDev() {
                if (this.dev) {
                    this.dev = null;
                    this.epIn = null;
                    this.epOut = null;
                    if (this.onConnectionChanged)
                        this.onConnectionChanged();
                }
            }
            error(msg) {
                throw new USBError(pxt.U.lf("USB error on device {0} ({1})", this.dev.productName, msg));
            }
            log(msg) {
                pxt.debug("webusb: " + msg);
            }
            disconnectAsync() {
                this.ready = false;
                if (!this.dev)
                    return Promise.resolve();
                this.log("close device");
                return this.dev.close()
                    .catch(e => {
                    // just ignore errors closing, most likely device just disconnected
                })
                    .then(() => {
                    this.clearDev();
                    return pxt.U.delay(500);
                });
            }
            reconnectAsync() {
                this.log("reconnect");
                this.setConnecting(true);
                return this.disconnectAsync()
                    .then(tryGetDevicesAsync)
                    .then(devs => this.connectAsync(devs))
                    .finally(() => this.setConnecting(false));
            }
            setConnecting(v) {
                if (v != this.connecting) {
                    this.connecting = v;
                    if (this.onConnectionChanged)
                        this.onConnectionChanged();
                }
            }
            isConnecting() {
                return this.connecting;
            }
            isConnected() {
                return !!this.dev && this.ready;
            }
            async connectAsync(devs) {
                this.log(`trying to connect (${devs.length} devices)`);
                // no devices...
                if (devs.length == 0) {
                    const e = new Error("Device not found.");
                    e.type = "devicenotfound";
                    throw e;
                }
                this.setConnecting(true);
                try {
                    // move last known device in front
                    // if we have a race with another tab when reconnecting, wait a bit if device unknown
                    if (this.lastKnownDeviceSerialNumber) {
                        const lastDev = devs.find(d => d.serialNumber === this.lastKnownDeviceSerialNumber);
                        if (lastDev) {
                            this.log(`last known device spotted`);
                            devs.splice(devs.indexOf(lastDev), 1);
                            devs.unshift(lastDev);
                        }
                        else {
                            // give another frame a chance to grab the device
                            this.log(`delay for last known device`);
                            await pxt.U.delay(2000);
                        }
                    }
                    // try to connect to one of the devices
                    for (let i = 0; i < devs.length; ++i) {
                        const dev = devs[i];
                        this.dev = dev;
                        this.log(`connect device: ${dev.manufacturerName} ${dev.productName}`);
                        this.log(`serial number: ${dev.serialNumber} ${this.lastKnownDeviceSerialNumber === dev.serialNumber ? "(last known device)" : ""} `);
                        try {
                            await this.initAsync();
                            // success, stop trying
                            return;
                        }
                        catch (e) {
                            this.dev = undefined; // clean state
                            this.log(`connection failed, ${e.message}`);
                            // try next
                        }
                    }
                    // failed to connect, all devices are locked or broken
                    const e = new Error(pxt.U.lf("Device in use or not found."));
                    e.type = "devicelocked";
                    throw e;
                }
                finally {
                    this.setConnecting(false);
                }
            }
            sendPacketAsync(pkt) {
                if (!this.dev)
                    return Promise.reject(new Error("Disconnected"));
                pxt.Util.assert(pkt.length <= 64);
                if (!this.epOut) {
                    return this.dev.controlTransferOut({
                        requestType: "class",
                        recipient: "interface",
                        request: controlTransferSetReport,
                        value: controlTransferOutReport,
                        index: this.iface.interfaceNumber
                    }, pkt).then(res => {
                        if (res.status != "ok")
                            this.error("USB CTRL OUT transfer failed");
                    });
                }
                return this.dev.transferOut(this.epOut.endpointNumber, pkt)
                    .then(res => {
                    if (res.status != "ok")
                        this.error("USB OUT transfer failed");
                });
            }
            readLoop() {
                if (this.readLoopStarted)
                    return;
                this.readLoopStarted = true;
                this.log("start read loop");
                let loop = () => {
                    if (!this.ready)
                        pxt.U.delay(300).then(loop);
                    else
                        this.recvPacketAsync()
                            .then(buf => {
                            if (buf[0]) {
                                // we've got data; retry reading immedietly after processing it
                                this.onData(buf);
                                loop();
                            }
                            else {
                                // throttle down if no data coming
                                pxt.U.delay(500).then(loop);
                            }
                        }, err => {
                            if (this.dev)
                                this.onError(err);
                            pxt.U.delay(300).then(loop);
                        });
                };
                loop();
            }
            recvPacketAsync() {
                let final = (res) => {
                    if (res.status != "ok")
                        this.error("USB IN transfer failed");
                    let arr = new Uint8Array(res.data.buffer);
                    if (arr.length == 0)
                        return this.recvPacketAsync();
                    return arr;
                };
                if (!this.dev)
                    return Promise.reject(new Error("Disconnected"));
                if (!this.epIn) {
                    return this.dev.controlTransferIn({
                        requestType: "class",
                        recipient: "interface",
                        request: controlTransferGetReport,
                        value: controlTransferInReport,
                        index: this.iface.interfaceNumber
                    }, 64).then(final);
                }
                return this.dev.transferIn(this.epIn.endpointNumber, 64)
                    .then(final);
            }
            initAsync() {
                if (!this.dev)
                    return Promise.reject(new Error("Disconnected"));
                let dev = this.dev;
                this.log("open device");
                return dev.open()
                    // assume one configuration; no one really does more
                    .then(() => {
                    this.log("select configuration");
                    return dev.selectConfiguration(1);
                })
                    .then(() => {
                    let matchesFilters = (iface) => {
                        let a0 = iface.alternates[0];
                        for (let f of usb.filters) {
                            if (f.classCode == null || a0.interfaceClass === f.classCode) {
                                if (f.subclassCode == null || a0.interfaceSubclass === f.subclassCode) {
                                    if (f.protocolCode == null || a0.interfaceProtocol === f.protocolCode) {
                                        if (a0.endpoints.length == 0)
                                            return true;
                                        if (a0.endpoints.length == 2 &&
                                            a0.endpoints.every(e => e.packetSize == 64))
                                            return true;
                                    }
                                }
                            }
                        }
                        return false;
                    };
                    this.log("got " + dev.configurations[0].interfaces.length + " interfaces");
                    const matching = dev.configurations[0].interfaces.filter(matchesFilters);
                    let iface = matching[matching.length - 1];
                    this.log(`${matching.length} matching interfaces; picking ${iface ? "#" + iface.interfaceNumber : "n/a"}`);
                    if (!iface)
                        this.error("cannot find supported USB interface");
                    this.altIface = iface.alternates[0];
                    this.iface = iface;
                    if (this.altIface.endpoints.length) {
                        this.log("using dedicated endpoints");
                        this.epIn = this.altIface.endpoints.filter(e => e.direction == "in")[0];
                        this.epOut = this.altIface.endpoints.filter(e => e.direction == "out")[0];
                        pxt.Util.assert(this.epIn.packetSize == 64);
                        pxt.Util.assert(this.epOut.packetSize == 64);
                    }
                    else {
                        this.log("using ctrl pipe");
                    }
                    this.log("claim interface");
                    return dev.claimInterface(iface.interfaceNumber);
                })
                    .then(() => {
                    this.log("device ready");
                    this.lastKnownDeviceSerialNumber = this.dev.serialNumber;
                    this.ready = true;
                    if (isHF2)
                        this.readLoop();
                    if (this.onConnectionChanged)
                        this.onConnectionChanged();
                });
            }
        }
        function pairAsync() {
            return navigator.usb.requestDevice({
                filters: usb.filters
            })
                .then(dev => !!dev)
                .catch(e => {
                // user cancelled
                if (e.name == "NotFoundError")
                    return undefined;
                throw e;
            });
        }
        usb.pairAsync = pairAsync;
        async function tryGetDevicesAsync() {
            pxt.log(`webusb: get devices`);
            try {
                const devs = await navigator.usb.getDevices();
                return devs || [];
            }
            catch (e) {
                pxt.reportException(e);
                return [];
            }
        }
        let _hid;
        function mkWebUSBHIDPacketIOAsync() {
            pxt.debug(`packetio: mk webusb io`);
            if (!_hid)
                _hid = new WebUSBHID();
            _hid.enable();
            return Promise.resolve(_hid);
        }
        usb.mkWebUSBHIDPacketIOAsync = mkWebUSBHIDPacketIOAsync;
        usb.isEnabled = false;
        function setEnabled(v) {
            if (!isAvailable())
                v = false;
            usb.isEnabled = v;
        }
        usb.setEnabled = setEnabled;
        let _available = undefined;
        async function checkAvailableAsync() {
            var _a, _b;
            if (_available !== undefined)
                return;
            pxt.debug(`webusb: checking availability`);
            // not supported by editor, cut short
            if (!((_b = (_a = pxt.appTarget) === null || _a === void 0 ? void 0 : _a.compile) === null || _b === void 0 ? void 0 : _b.webUSB)) {
                _available = false;
                return;
            }
            if (pxt.BrowserUtils.isElectron() || pxt.BrowserUtils.isWinRT()) {
                pxt.debug(`webusb: off, electron or winrt`);
                pxt.tickEvent('webusb.off', { 'reason': 'electronwinrt' });
                _available = false;
                return;
            }
            const _usb = navigator.usb;
            if (!_usb) {
                pxt.debug(`webusb: off, not impl`);
                pxt.tickEvent('webusb.off', { 'reason': 'notimpl' });
                _available = false;
                return;
            }
            // Windows versions:
            // 5.1 - XP, 6.0 - Vista, 6.1 - Win7, 6.2 - Win8, 6.3 - Win8.1, 10.0 - Win10
            // If on Windows, and Windows is older 8.1, don't enable WebUSB,
            // as it requires signed INF files.
            let m = /Windows NT (\d+\.\d+)/.exec(navigator.userAgent);
            if (m && parseFloat(m[1]) < 6.3) {
                pxt.debug(`webusb: off, older windows version`);
                pxt.tickEvent('webusb.off', { 'reason': 'oldwindows' });
                _available = false;
                return;
            }
            // check security
            try {
                // iframes must specify allow="usb" in order to support WebUSB
                await _usb.getDevices();
            }
            catch (e) {
                pxt.debug(`webusb: off, security exception`);
                pxt.tickEvent('webusb.off', { 'reason': 'security' });
                _available = false;
                return;
            }
            // yay!
            _available = true;
            return;
        }
        usb.checkAvailableAsync = checkAvailableAsync;
        function isAvailable() {
            if (_available === undefined) {
                console.error(`checkAvailableAsync not called`);
                checkAvailableAsync();
            }
            return !!_available;
        }
        usb.isAvailable = isAvailable;
    })(usb = pxt.usb || (pxt.usb = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var worker;
    (function (worker_1) {
        var U = pxt.Util;
        let workers = {};
        // Gets a cached worker for the given file
        function getWorker(workerFile) {
            let w = workers[workerFile];
            if (!w) {
                w = workers[workerFile] = makeWebWorker(workerFile);
            }
            return w;
        }
        worker_1.getWorker = getWorker;
        function wrap(send) {
            let pendingMsgs = {};
            let msgId = 0;
            let q = new U.PromiseQueue();
            let initPromise = new Promise((resolve, reject) => {
                pendingMsgs["ready"] = resolve;
            });
            q.enqueue("main", () => initPromise);
            let recvHandler = (data) => {
                if (pendingMsgs.hasOwnProperty(data.id)) {
                    let cb = pendingMsgs[data.id];
                    delete pendingMsgs[data.id];
                    cb(data.result);
                }
            };
            function opAsync(op, arg) {
                return q.enqueue("main", () => new Promise((resolve, reject) => {
                    let id = "" + msgId++;
                    pendingMsgs[id] = v => {
                        if (!v) {
                            //pxt.reportError("worker", "no response")
                            reject(new Error("no response"));
                        }
                        else if (v.errorMessage) {
                            //pxt.reportError("worker", v.errorMessage)
                            reject(new Error(v.errorMessage));
                        }
                        else {
                            resolve(v);
                        }
                    };
                    send({ id, op, arg });
                }));
            }
            return { opAsync, recvHandler };
        }
        worker_1.wrap = wrap;
        function makeWebWorker(workerFile) {
            let worker = new Worker(workerFile);
            let iface = wrap(v => worker.postMessage(v));
            worker.onmessage = ev => {
                pxt.perf.measureStart("webworker recvHandler");
                iface.recvHandler(ev.data);
                pxt.perf.measureEnd("webworker recvHandler");
            };
            return iface;
        }
        worker_1.makeWebWorker = makeWebWorker;
        function makeWebSocket(url, onOOB = null) {
            let ws = new WebSocket(url);
            let sendq = [];
            let iface = wrap(v => {
                let s = JSON.stringify(v);
                if (sendq)
                    sendq.push(s);
                else
                    ws.send(s);
            });
            ws.onmessage = ev => {
                let js = JSON.parse(ev.data);
                if (onOOB && js.id == null) {
                    onOOB(js);
                }
                else {
                    iface.recvHandler(js);
                }
            };
            ws.onopen = (ev) => {
                pxt.debug('socket opened');
                for (let m of sendq)
                    ws.send(m);
                sendq = null;
            };
            ws.onclose = (ev) => {
                pxt.debug('socket closed');
            };
            ws.onerror = (ev) => {
                pxt.debug('socket errored');
            };
            return iface;
        }
        worker_1.makeWebSocket = makeWebSocket;
    })(worker = pxt.worker || (pxt.worker = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var youtube;
    (function (youtube) {
        youtube.apiKey = undefined;
        function checkKey() {
            if (!youtube.apiKey)
                pxt.U.userError(`YouTube API key missing`);
        }
        function resolveThumbnail(thumbnails) {
            if (!thumbnails)
                return "";
            const thumbnail = (thumbnails.medium || thumbnails.high || thumbnails.standard || thumbnails.default);
            return (thumbnail === null || thumbnail === void 0 ? void 0 : thumbnail.url) || "";
        }
        function resolveDescription(d) {
            // grab first paragraph.
            return d.split(/\n\s+/, 1)[0].trim();
        }
        function playlistItemToCodeCard(video) {
            return {
                "name": video.snippet.title.replace(/[^-]*-/, '').trim(),
                "description": resolveDescription(video.snippet.description),
                "youTubeId": video.snippet.resourceId.videoId,
                "youTubePlaylistId": video.snippet.playlistId,
                "imageUrl": resolveThumbnail(video.snippet.thumbnails)
            };
        }
        youtube.playlistItemToCodeCard = playlistItemToCodeCard;
        function playlistInfoAsync(playlistId) {
            checkKey();
            const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${youtube.apiKey}`;
            return pxt.Util.httpGetJsonAsync(url)
                .then((res) => res.items[0]);
        }
        youtube.playlistInfoAsync = playlistInfoAsync;
        async function listPlaylistVideosAsync(playlistId) {
            checkKey();
            let items = [];
            let pageToken = undefined;
            do {
                let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${youtube.apiKey}`;
                if (pageToken)
                    url += `&pageToken=${pageToken}`;
                const videos = await pxt.Util.httpGetJsonAsync(url);
                items = items.concat(videos.items);
                pageToken = videos.nextPageToken;
            } while (pageToken);
            if (pxt.options.debug)
                pxt.debug(JSON.stringify(items, null, 2));
            return items;
        }
        youtube.listPlaylistVideosAsync = listPlaylistVideosAsync;
        function watchUrl(videoId, playlistId) {
            let url = undefined;
            if (videoId) {
                url = `https://www.youtube.com/watch?v=${videoId}`;
                if (playlistId)
                    url += `&list=${playlistId}`;
            }
            else if (playlistId) {
                url = `https://www.youtube.com/playlist?list=${playlistId}`;
            }
            return url;
        }
        youtube.watchUrl = watchUrl;
    })(youtube = pxt.youtube || (pxt.youtube = {}));
})(pxt || (pxt = {}));
/* eslint-disable no-cond-assign */
// TODO: add a macro facility to make 8-bit assembly easier?
var ts;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        var assembler;
        (function (assembler) {
            assembler.debug = false;
            function lf(fmt, ...args) {
                return fmt.replace(/{(\d+)}/g, (match, index) => args[+index]);
            }
            assembler.lf = lf;
            let badNameError = emitErr("opcode name doesn't match", "<name>");
            // An Instruction represents an instruction class with meta-variables
            // that should be substituted given an actually line (Line) of assembly
            // Thus, the Instruction helps us parse a sequence of tokens in a Line
            // as well as extract the relevant values to substitute for the meta-variables.
            // The Instruction also knows how to convert the particular instance into
            // machine code (EmitResult)
            class Instruction {
                constructor(ei, format, opcode, mask, is32bit) {
                    this.opcode = opcode;
                    this.mask = mask;
                    this.is32bit = is32bit;
                    this.canBeShared = false;
                    pxtc.assert((opcode & mask) == opcode);
                    this.ei = ei;
                    this.code = format.replace(/\s+/g, " ");
                    this.friendlyFmt = format.replace(/\$\w+/g, m => {
                        if (this.ei.encoders[m])
                            return this.ei.encoders[m].pretty;
                        return m;
                    });
                    let words = tokenize(format);
                    this.name = words[0];
                    this.args = words.slice(1);
                }
                emit(ln) {
                    let tokens = ln.words;
                    if (tokens[0] != this.name)
                        return badNameError;
                    let r = this.opcode;
                    let j = 1;
                    let stack = 0;
                    let numArgs = [];
                    let labelName = null;
                    let bit32_value = null;
                    let bit32_actual = null;
                    for (let i = 0; i < this.args.length; ++i) {
                        let formal = this.args[i];
                        let actual = tokens[j++];
                        if (formal[0] == "$") {
                            let enc = this.ei.encoders[formal];
                            let v = null;
                            if (enc.isRegister) {
                                v = this.ei.registerNo(actual);
                                if (v == null)
                                    return emitErr("expecting register name", actual);
                                if (this.ei.isPush(this.opcode)) // push
                                    stack++;
                                else if (this.ei.isPop(this.opcode)) // pop
                                    stack--;
                            }
                            else if (enc.isImmediate) {
                                actual = actual.replace(/^#/, "");
                                v = ln.bin.parseOneInt(actual);
                                if (v == null) {
                                    return emitErr("expecting number", actual);
                                }
                                else {
                                    // explicit manipulation of stack pointer (SP)
                                    // ARM only
                                    if (this.ei.isAddSP(this.opcode))
                                        stack = -(v / this.ei.wordSize());
                                    else if (this.ei.isSubSP(this.opcode))
                                        stack = (v / this.ei.wordSize());
                                }
                            }
                            else if (enc.isRegList) {
                                // register lists are ARM-specific - this code not used in AVR
                                if (actual != "{")
                                    return emitErr("expecting {", actual);
                                v = 0;
                                while (tokens[j] != "}") {
                                    actual = tokens[j++];
                                    if (!actual)
                                        return emitErr("expecting }", tokens[j - 2]);
                                    let no = this.ei.registerNo(actual);
                                    if (no == null)
                                        return emitErr("expecting register name", actual);
                                    if (v & (1 << no))
                                        return emitErr("duplicate register name", actual);
                                    v |= (1 << no);
                                    if (this.ei.isPush(this.opcode)) // push
                                        stack++;
                                    else if (this.ei.isPop(this.opcode)) // pop
                                        stack--;
                                    if (tokens[j] == ",")
                                        j++;
                                }
                                actual = tokens[j++]; // skip close brace
                            }
                            else if (enc.isLabel) {
                                actual = actual.replace(/^#/, "");
                                if (/^[+-]?\d+$/.test(actual)) {
                                    v = parseInt(actual, 10);
                                    labelName = "rel" + v;
                                }
                                else if (/^0x[0-9a-fA-F]+$/.test(actual)) {
                                    v = parseInt(actual, 16);
                                    labelName = "abs" + v;
                                }
                                else {
                                    labelName = actual;
                                    v = this.ei.getAddressFromLabel(ln.bin, this, actual, enc.isWordAligned);
                                    if (v == null) {
                                        if (ln.bin.finalEmit)
                                            return emitErr("unknown label", actual);
                                        else
                                            // just need some value when we are
                                            // doing some pass other than finalEmit
                                            v = 8; // needs to be divisible by 4 etc
                                    }
                                }
                                if (this.ei.is32bit(this)) {
                                    // console.log(actual + " " + v.toString())
                                    bit32_value = v;
                                    bit32_actual = actual;
                                    continue;
                                }
                            }
                            else {
                                pxtc.oops();
                            }
                            if (v == null)
                                return emitErr("didn't understand it", actual); // shouldn't happen
                            numArgs.push(v);
                            v = enc.encode(v);
                            // console.log("enc(v) = ",v)
                            if (v == null)
                                return emitErr("argument out of range or mis-aligned", actual);
                            pxtc.assert((r & v) == 0);
                            r |= v;
                        }
                        else if (formal == actual) {
                            // skip
                        }
                        else {
                            return emitErr("expecting " + formal, actual);
                        }
                    }
                    if (tokens[j])
                        return emitErr("trailing tokens", tokens[j]);
                    if (this.ei.is32bit(this)) {
                        return this.ei.emit32(r, bit32_value, ln.bin.normalizeExternalLabel(bit32_actual));
                    }
                    return {
                        stack: stack,
                        opcode: r,
                        numArgs: numArgs,
                        labelName: ln.bin.normalizeExternalLabel(labelName)
                    };
                }
                toString() {
                    return this.friendlyFmt;
                }
            }
            assembler.Instruction = Instruction;
            // represents a line of assembly from a file
            class Line {
                constructor(bin, text) {
                    this.bin = bin;
                    this.text = text;
                }
                getOpExt() {
                    return this.instruction ? this.instruction.code : "";
                }
                getOp() {
                    return this.instruction ? this.instruction.name : "";
                }
                update(s) {
                    this.bin.peepOps++;
                    s = s.replace(/^\s*/, "");
                    if (!s)
                        this.bin.peepDel++;
                    if (s)
                        s += "      ";
                    s = "    " + s;
                    this.text = s + "; WAS: " + this.text.trim();
                    this.instruction = null;
                    this.numArgs = null;
                    this.words = tokenize(s) || [];
                    if (this.words.length == 0)
                        this.type = "empty";
                    else if (this.words[0][0] == "@")
                        this.type = "directive";
                }
            }
            assembler.Line = Line;
            // File is the center of the action: parsing a file into a sequence of Lines
            // and also emitting the binary (buf)
            class File {
                constructor(ei) {
                    this.baseOffset = 0;
                    this.checkStack = true;
                    this.inlineMode = false;
                    this.normalizeExternalLabel = (n) => n;
                    this.currLineNo = 0;
                    this.scope = "";
                    this.scopeId = 0;
                    this.errors = [];
                    this.labels = {};
                    this.equs = {};
                    this.stackpointers = {};
                    this.stack = 0;
                    this.commPtr = 0;
                    this.peepOps = 0;
                    this.peepDel = 0;
                    this.peepCounts = {};
                    this.stats = "";
                    this.throwOnError = false;
                    this.disablePeepHole = false;
                    this.stackAtLabel = {};
                    this.currLine = new Line(this, "<start>");
                    this.currLine.lineNo = 0;
                    this.ei = ei;
                    this.ei.file = this;
                }
                emitShort(op) {
                    pxtc.assert(0 <= op && op <= 0xffff);
                    this.buf.push(op);
                }
                emitOpCode(op) {
                    this.emitShort(op);
                }
                location() {
                    // store one short (2 bytes) per buf location
                    return this.buf.length * 2;
                }
                pc() {
                    return this.location() + this.baseOffset;
                }
                // parsing of an "integer", well actually much more than
                // just that
                parseOneInt(s) {
                    if (!s)
                        return null;
                    // fast path
                    if (/^\d+$/.test(s))
                        return parseInt(s, 10);
                    const minP = s.indexOf("-");
                    if (minP > 0)
                        return this.parseOneInt(s.slice(0, minP)) - this.parseOneInt(s.slice(minP + 1));
                    let mul = 1;
                    // recursive-descent parsing of multiplication
                    if (s.indexOf("*") >= 0) {
                        let m = null;
                        while (m = /^([^\*]*)\*(.*)$/.exec(s)) {
                            let tmp = this.parseOneInt(m[1]);
                            if (tmp == null)
                                return null;
                            mul *= tmp;
                            s = m[2];
                        }
                    }
                    if (s[0] == "-") {
                        mul *= -1;
                        s = s.slice(1);
                    }
                    else if (s[0] == "+") {
                        s = s.slice(1);
                    }
                    // decimal encoding; fast-ish path
                    if (/^\d+$/.test(s))
                        return mul * parseInt(s, 10);
                    // allow or'ing of 1 to least-signficant bit
                    if (pxtc.U.endsWith(s, "|1")) {
                        return this.parseOneInt(s.slice(0, s.length - 2)) | 1;
                    }
                    // allow subtracting 1 too
                    if (pxtc.U.endsWith(s, "-1")) {
                        return this.parseOneInt(s.slice(0, s.length - 2)) - 1;
                    }
                    // allow adding 1 too
                    if (pxtc.U.endsWith(s, "+1")) {
                        return this.parseOneInt(s.slice(0, s.length - 2)) + 1;
                    }
                    let shm = /(.*)>>(\d+)$/.exec(s);
                    if (shm) {
                        let left = this.parseOneInt(shm[1]);
                        let mask = this.baseOffset & ~0xffffff;
                        left &= ~mask;
                        return left >> parseInt(shm[2]);
                    }
                    let v = null;
                    // handle hexadecimal and binary encodings
                    if (s[0] == "0") {
                        if (s[1] == "x" || s[1] == "X") {
                            let m = /^0x([a-f0-9]+)$/i.exec(s);
                            if (m)
                                v = parseInt(m[1], 16);
                        }
                        else if (s[1] == "b" || s[1] == "B") {
                            let m = /^0b([01]+)$/i.exec(s);
                            if (m)
                                v = parseInt(m[1], 2);
                        }
                    }
                    // stack-specific processing
                    // more special characters to handle
                    if (s.indexOf("@") >= 0) {
                        let m = /^(\w+)@(-?\d+)$/.exec(s);
                        if (m) {
                            if (mul != 1)
                                this.directiveError(lf("multiplication not supported with saved stacks"));
                            if (this.stackpointers.hasOwnProperty(m[1])) {
                                // console.log(m[1] + ": " + this.stack + " " + this.stackpointers[m[1]] + " " + m[2])
                                v = this.ei.wordSize() * this.ei.computeStackOffset(m[1], this.stack - this.stackpointers[m[1]] + parseInt(m[2]));
                                // console.log(v)
                            }
                            else
                                this.directiveError(lf("saved stack not found"));
                        }
                        m = /^(.*)@(hi|lo|fn)$/.exec(s);
                        if (m && this.looksLikeLabel(m[1])) {
                            v = this.lookupLabel(m[1], true);
                            if (v != null) {
                                if (m[2] == "fn") {
                                    v = this.ei.toFnPtr(v, this.baseOffset, m[1]);
                                }
                                else {
                                    v >>= 1;
                                    if (0 <= v && v <= 0xffff) {
                                        if (m[2] == "hi")
                                            v = (v >> 8) & 0xff;
                                        else if (m[2] == "lo")
                                            v = v & 0xff;
                                        else
                                            pxtc.oops();
                                    }
                                    else {
                                        this.directiveError(lf("@hi/lo out of range"));
                                        v = null;
                                    }
                                }
                            }
                        }
                    }
                    if (v == null && this.looksLikeLabel(s)) {
                        v = this.lookupLabel(s, true);
                        if (v != null) {
                            if (this.ei.postProcessRelAddress(this, 1) == 1)
                                v += this.baseOffset;
                        }
                    }
                    if (v == null || isNaN(v))
                        return null;
                    return v * mul;
                }
                looksLikeLabel(name) {
                    if (/^(r\d|pc|sp|lr)$/i.test(name))
                        return false;
                    return /^[\.a-zA-Z_][\.:\w+]*$/.test(name);
                }
                scopedName(name) {
                    if (name[0] == "." && this.scope)
                        return this.scope + "$" + name;
                    else
                        return name;
                }
                lookupLabel(name, direct = false) {
                    let v = null;
                    let scoped = this.scopedName(name);
                    if (this.labels.hasOwnProperty(scoped)) {
                        v = this.labels[scoped];
                        v = this.ei.postProcessRelAddress(this, v);
                    }
                    else if (this.lookupExternalLabel) {
                        v = this.lookupExternalLabel(name);
                        if (v != null) {
                            v = this.ei.postProcessAbsAddress(this, v);
                        }
                    }
                    if (v == null && this.equs.hasOwnProperty(scoped)) {
                        v = this.equs[scoped];
                        // no post-processing
                    }
                    if (v == null && direct) {
                        if (this.finalEmit) {
                            this.directiveError(lf("unknown label: {0}", name));
                        }
                        else
                            // use a number over 1 byte
                            v = 11111;
                    }
                    return v;
                }
                align(n) {
                    pxtc.assert(n == 2 || n == 4 || n == 8 || n == 16);
                    while (this.location() % n != 0)
                        this.emitOpCode(0);
                }
                pushError(msg, hints = "") {
                    let err = {
                        scope: this.scope,
                        message: lf("  -> Line {2} ('{1}'), error: {0}\n{3}", msg, this.currLine.text, this.currLine.lineNo, hints),
                        lineNo: this.currLine.lineNo,
                        line: this.currLine.text,
                        coremsg: msg,
                        hints: hints
                    };
                    this.errors.push(err);
                    if (this.throwOnError)
                        throw new Error(err.message);
                }
                directiveError(msg) {
                    this.pushError(msg);
                    // this.pushError(lf("directive error: {0}", msg))
                }
                emitString(l, utf16 = false) {
                    function byteAt(s, i) { return (s.charCodeAt(i) || 0) & 0xff; }
                    let m = /^\s*([\w\.]+\s*:\s*)?.\w+\s+(".*")\s*$/.exec(l);
                    let s;
                    if (!m || null == (s = parseString(m[2]))) {
                        this.directiveError(lf("expecting string"));
                    }
                    else {
                        this.align(2);
                        if (utf16) {
                            for (let i = 0; i < s.length; i++) {
                                this.emitShort(s.charCodeAt(i));
                            }
                        }
                        else {
                            // s.length + 1 to NUL terminate
                            for (let i = 0; i < s.length + 1; i += 2) {
                                this.emitShort((byteAt(s, i + 1) << 8) | byteAt(s, i));
                            }
                        }
                    }
                }
                parseNumber(words) {
                    let v = this.parseOneInt(words.shift());
                    if (v == null)
                        return null;
                    return v;
                }
                parseNumbers(words) {
                    words = words.slice(1);
                    let nums = [];
                    while (true) {
                        let n = this.parseNumber(words);
                        if (n == null) {
                            this.directiveError(lf("cannot parse number at '{0}'", words[0]));
                            break;
                        }
                        else
                            nums.push(n);
                        if (words[0] == ",") {
                            words.shift();
                            if (words[0] == null)
                                break;
                        }
                        else if (words[0] == null) {
                            break;
                        }
                        else {
                            this.directiveError(lf("expecting number, got '{0}'", words[0]));
                            break;
                        }
                    }
                    return nums;
                }
                emitSpace(words) {
                    let nums = this.parseNumbers(words);
                    if (nums.length == 1)
                        nums.push(0);
                    if (nums.length != 2)
                        this.directiveError(lf("expecting one or two numbers"));
                    else if (nums[0] % 2 != 0)
                        this.directiveError(lf("only even space supported"));
                    else {
                        let f = nums[1] & 0xff;
                        f = f | (f << 8);
                        for (let i = 0; i < nums[0]; i += 2)
                            this.emitShort(f);
                    }
                }
                emitBytes(words) {
                    let nums = this.parseNumbers(words);
                    if (nums.length % 2 != 0) {
                        this.directiveError(".bytes needs an even number of arguments");
                        nums.push(0);
                    }
                    for (let i = 0; i < nums.length; i += 2) {
                        let n0 = nums[i];
                        let n1 = nums[i + 1];
                        if (0 <= n0 && n1 <= 0xff &&
                            0 <= n1 && n0 <= 0xff)
                            this.emitShort((n0 & 0xff) | ((n1 & 0xff) << 8));
                        else
                            this.directiveError(lf("expecting uint8"));
                    }
                }
                emitHex(words) {
                    words.slice(1).forEach(w => {
                        if (w == ",")
                            return;
                        // TODO: why 4 and not 2?
                        if (w.length % 4 != 0)
                            this.directiveError(".hex needs an even number of bytes");
                        else if (!/^[a-f0-9]+$/i.test(w))
                            this.directiveError(".hex needs a hex number");
                        else
                            for (let i = 0; i < w.length; i += 4) {
                                let n = parseInt(w.slice(i, i + 4), 16);
                                n = ((n & 0xff) << 8) | ((n >> 8) & 0xff);
                                this.emitShort(n);
                            }
                    });
                }
                handleDirective(l) {
                    let words = l.words;
                    let expectOne = () => {
                        if (words.length != 2)
                            this.directiveError(lf("expecting one argument"));
                    };
                    let num0;
                    switch (words[0]) {
                        case ".ascii":
                        case ".asciz":
                        case ".string":
                            this.emitString(l.text);
                            break;
                        case ".utf16":
                            this.emitString(l.text, true);
                            break;
                        case ".align":
                            expectOne();
                            num0 = this.parseOneInt(words[1]);
                            if (num0 != null) {
                                if (num0 == 0)
                                    return;
                                if (num0 <= 4) {
                                    this.align(1 << num0);
                                }
                                else {
                                    this.directiveError(lf("expecting 1, 2, 3 or 4 (for 2, 4, 8, or 16 byte alignment)"));
                                }
                            }
                            else
                                this.directiveError(lf("expecting number"));
                            break;
                        case ".balign":
                            expectOne();
                            num0 = this.parseOneInt(words[1]);
                            if (num0 != null) {
                                if (num0 == 1)
                                    return;
                                if (num0 == 2 || num0 == 4 || num0 == 8 || num0 == 16) {
                                    this.align(num0);
                                }
                                else {
                                    this.directiveError(lf("expecting 2, 4, 8, or 16"));
                                }
                            }
                            else
                                this.directiveError(lf("expecting number"));
                            break;
                        case ".p2align":
                            expectOne();
                            num0 = this.parseOneInt(words[1]);
                            if (num0 != null) {
                                this.align(1 << num0);
                            }
                            else
                                this.directiveError(lf("expecting number"));
                            break;
                        case ".byte":
                            this.emitBytes(words);
                            break;
                        case ".hex":
                            this.emitHex(words);
                            break;
                        case ".hword":
                        case ".short":
                        case ".2bytes":
                            this.parseNumbers(words).forEach(n => {
                                // we allow negative numbers
                                if (-0x8000 <= n && n <= 0xffff)
                                    this.emitShort(n & 0xffff);
                                else
                                    this.directiveError(lf("expecting int16"));
                            });
                            break;
                        case ".word":
                        case ".4bytes":
                        case ".long":
                            // TODO: a word is machine-dependent (16-bit for AVR, 32-bit for ARM)
                            this.parseNumbers(words).forEach(n => {
                                // we allow negative numbers
                                if (-0x80000000 <= n && n <= 0xffffffff) {
                                    this.emitShort(n & 0xffff);
                                    this.emitShort((n >> 16) & 0xffff);
                                }
                                else {
                                    this.directiveError(lf("expecting int32"));
                                }
                            });
                            break;
                        case ".skip":
                        case ".space":
                            this.emitSpace(words);
                            break;
                        case ".set":
                        case ".equ":
                            if (!/^\w+$/.test(words[1]))
                                this.directiveError(lf("expecting name"));
                            const nums = this.parseNumbers(words.slice(words[2] == "," || words[2] == "="
                                ? 2 : 1));
                            if (nums.length != 1)
                                this.directiveError(lf("expecting one value"));
                            if (this.equs[words[1]] !== undefined &&
                                this.equs[words[1]] != nums[0])
                                this.directiveError(lf("redefinition of {0}", words[1]));
                            this.equs[words[1]] = nums[0];
                            break;
                        case ".startaddr":
                            if (this.location())
                                this.directiveError(lf(".startaddr can be only be specified at the beginning of the file"));
                            expectOne();
                            this.baseOffset = this.parseOneInt(words[1]);
                            break;
                        // The usage for this is as follows:
                        // push {...}
                        // @stackmark locals   ; locals := sp
                        // ... some push/pops ...
                        // ldr r0, [sp, locals@3] ; load local number 3
                        // ... some push/pops ...
                        // @stackempty locals ; expect an empty stack here
                        case "@stackmark":
                            expectOne();
                            this.stackpointers[words[1]] = this.stack;
                            break;
                        case "@stackempty":
                            if (this.checkStack) {
                                if (this.stackpointers[words[1]] == null)
                                    this.directiveError(lf("no such saved stack"));
                                else if (this.stackpointers[words[1]] != this.stack)
                                    this.directiveError(lf("stack mismatch"));
                            }
                            break;
                        case "@scope":
                            this.scope = words[1] || "";
                            this.currLineNo = this.scope ? 0 : this.realCurrLineNo;
                            break;
                        case ".syntax":
                        case "@nostackcheck":
                            this.checkStack = false;
                            break;
                        case "@dummystack":
                            expectOne();
                            this.stack += this.parseOneInt(words[1]);
                            break;
                        case ".section":
                        case ".global":
                            this.stackpointers = {};
                            this.stack = 0;
                            this.scope = "$S" + this.scopeId++;
                            break;
                        case ".comm": {
                            words = words.filter(x => x != ",");
                            words.shift();
                            let sz = this.parseOneInt(words[1]);
                            let align = 0;
                            if (words[2])
                                align = this.parseOneInt(words[2]);
                            else
                                align = 4; // not quite what AS does...
                            let val = this.lookupLabel(words[0]);
                            if (val == null) {
                                if (!this.commPtr) {
                                    this.commPtr = this.lookupExternalLabel("_pxt_comm_base") || 0;
                                    if (!this.commPtr)
                                        this.directiveError(lf("PXT_COMM_BASE not defined"));
                                }
                                while (this.commPtr & (align - 1))
                                    this.commPtr++;
                                this.labels[this.scopedName(words[0])] = this.commPtr - this.baseOffset;
                                this.commPtr += sz;
                            }
                            break;
                        }
                        case ".file":
                        case ".text":
                        case ".cpu":
                        case ".fpu":
                        case ".eabi_attribute":
                        case ".code":
                        case ".thumb_func":
                        case ".type":
                        case ".fnstart":
                        case ".save":
                        case ".size":
                        case ".fnend":
                        case ".pad":
                        case ".globl": // TODO might need this one
                        case ".local":
                            break;
                        case "@":
                            // @ sp needed
                            break;
                        default:
                            if (/^\.cfi_/.test(words[0])) {
                                // ignore
                            }
                            else {
                                this.directiveError(lf("unknown directive"));
                            }
                            break;
                    }
                }
                handleOneInstruction(ln, instr) {
                    let op = instr.emit(ln);
                    if (!op.error) {
                        this.stack += op.stack;
                        if (this.checkStack && this.stack < 0)
                            this.pushError(lf("stack underflow"));
                        ln.location = this.location();
                        ln.opcode = op.opcode;
                        ln.stack = op.stack;
                        this.emitOpCode(op.opcode);
                        if (op.opcode2 != null)
                            this.emitOpCode(op.opcode2);
                        if (op.opcode3 != null)
                            this.emitOpCode(op.opcode3);
                        ln.instruction = instr;
                        ln.numArgs = op.numArgs;
                        return true;
                    }
                    return false;
                }
                handleInstruction(ln) {
                    if (ln.instruction) {
                        if (this.handleOneInstruction(ln, ln.instruction))
                            return;
                    }
                    let getIns = (n) => this.ei.instructions.hasOwnProperty(n) ? this.ei.instructions[n] : [];
                    if (!ln.instruction) {
                        let ins = getIns(ln.words[0]);
                        for (let i = 0; i < ins.length; ++i) {
                            if (this.handleOneInstruction(ln, ins[i]))
                                return;
                        }
                    }
                    let w0 = ln.words[0].toLowerCase().replace(/s$/, "").replace(/[^a-z]/g, "");
                    let hints = "";
                    let possibilities = getIns(w0).concat(getIns(w0 + "s"));
                    if (possibilities.length > 0) {
                        possibilities.forEach(i => {
                            let err = i.emit(ln);
                            hints += lf("   Maybe: {0} ({1} at '{2}')\n", i.toString(), err.error, err.errorAt);
                        });
                    }
                    this.pushError(lf("assembly error"), hints);
                }
                buildLine(tx, lst) {
                    let mkLine = (tx) => {
                        let l = new Line(this, tx);
                        l.scope = this.scope;
                        l.lineNo = this.currLineNo;
                        lst.push(l);
                        return l;
                    };
                    let l = mkLine(tx);
                    let words = tokenize(l.text) || [];
                    l.words = words;
                    let w0 = words[0] || "";
                    if (w0.charAt(w0.length - 1) == ":") {
                        let m = /^([\.\w]+):$/.exec(words[0]);
                        if (m) {
                            l.type = "label";
                            l.text = m[1] + ":";
                            l.words = [m[1]];
                            if (words.length > 1) {
                                words.shift();
                                l = mkLine(tx.replace(/^[^:]*:/, ""));
                                l.words = words;
                                w0 = words[0] || "";
                            }
                            else {
                                return;
                            }
                        }
                    }
                    let c0 = w0.charAt(0);
                    if (c0 == "." || c0 == "@") {
                        l.type = "directive";
                        if (l.words[0] == "@scope")
                            this.handleDirective(l);
                    }
                    else {
                        if (l.words.length == 0)
                            l.type = "empty";
                        else
                            l.type = "instruction";
                    }
                }
                prepLines(text) {
                    this.currLineNo = 0;
                    this.realCurrLineNo = 0;
                    this.lines = [];
                    text.split(/\r?\n/).forEach(tx => {
                        if (this.errors.length > 10)
                            return;
                        this.currLineNo++;
                        this.realCurrLineNo++;
                        this.buildLine(tx, this.lines);
                    });
                }
                iterLines() {
                    this.stack = 0;
                    this.buf = [];
                    this.scopeId = 0;
                    this.lines.forEach(l => {
                        if (this.errors.length > 10)
                            return;
                        this.currLine = l;
                        if (l.words.length == 0)
                            return;
                        if (l.type == "label") {
                            let lblname = this.scopedName(l.words[0]);
                            this.prevLabel = lblname;
                            if (this.finalEmit) {
                                if (this.equs[lblname] != null)
                                    this.directiveError(lf(".equ redefined as label"));
                                let curr = this.labels[lblname];
                                if (curr == null)
                                    pxtc.oops();
                                if (this.errors.length == 0 && curr != this.location()) {
                                    pxtc.oops(`invalid location: ${this.location()} != ${curr} at ${lblname}`);
                                }
                                pxtc.assert(this.errors.length > 0 || curr == this.location());
                                if (this.reallyFinalEmit) {
                                    this.stackAtLabel[lblname] = this.stack;
                                }
                            }
                            else {
                                if (this.labels.hasOwnProperty(lblname))
                                    this.directiveError(lf("label redefinition"));
                                else if (this.inlineMode && /^_/.test(lblname))
                                    this.directiveError(lf("labels starting with '_' are reserved for the compiler"));
                                else {
                                    this.labels[lblname] = this.location();
                                }
                            }
                            l.location = this.location();
                        }
                        else if (l.type == "directive") {
                            this.handleDirective(l);
                        }
                        else if (l.type == "instruction") {
                            this.handleInstruction(l);
                        }
                        else if (l.type == "empty") {
                            // nothing
                        }
                        else {
                            pxtc.oops();
                        }
                    });
                }
                getSource(clean, numStmts = 1, flashSize = 0) {
                    let lenPrev = 0;
                    let size = (lbl) => {
                        let curr = this.labels[lbl] || lenPrev;
                        let sz = curr - lenPrev;
                        lenPrev = curr;
                        return sz;
                    };
                    let lenTotal = this.buf ? this.location() : 0;
                    let lenCode = size("_code_end");
                    let lenHelpers = size("_helpers_end");
                    let lenVtables = size("_vtables_end");
                    let lenLiterals = size("_literals_end");
                    let lenAllCode = lenPrev;
                    let totalSize = (lenTotal + this.baseOffset) & 0xffffff;
                    if (flashSize && totalSize > flashSize)
                        pxtc.U.userError(lf("program too big by {0} bytes!", totalSize - flashSize));
                    flashSize = flashSize || 128 * 1024;
                    let totalInfo = lf("; total bytes: {0} ({1}% of {2}k flash with {3} free)", totalSize, (100 * totalSize / flashSize).toFixed(1), (flashSize / 1024).toFixed(1), flashSize - totalSize);
                    let res = 
                    // ARM-specific
                    lf("; generated code sizes (bytes): {0} (incl. {1} user, {2} helpers, {3} vtables, {4} lits); src size {5}\n", lenAllCode, lenCode, lenHelpers, lenVtables, lenLiterals, lenTotal - lenAllCode) +
                        lf("; assembly: {0} lines; density: {1} bytes/stmt; ({2} stmts)\n", this.lines.length, Math.round(100 * lenCode / numStmts) / 100, numStmts) +
                        totalInfo + "\n" +
                        this.stats + "\n\n";
                    let skipOne = false;
                    this.lines.forEach((ln, i) => {
                        if (ln.words[0] == "_stored_program") {
                            res += "_stored_program: .string \"...\"\n";
                            skipOne = true;
                            return;
                        }
                        if (skipOne) {
                            skipOne = false;
                            return;
                        }
                        let text = ln.text;
                        if (clean) {
                            if (ln.words[0] == "@stackempty" &&
                                this.lines[i - 1].text == ln.text)
                                return;
                            text = text.replace(/; WAS: .*/, "");
                            if (!text.trim())
                                return;
                        }
                        if (assembler.debug)
                            if (ln.type == "label" || ln.type == "instruction")
                                text += ` \t; 0x${(ln.location + this.baseOffset).toString(16)}`;
                        res += text + "\n";
                    });
                    return res;
                }
                peepHole() {
                    // TODO add: str X; ldr X -> str X ?
                    let mylines = this.lines.filter(l => l.type != "empty");
                    for (let i = 0; i < mylines.length; ++i) {
                        let ln = mylines[i];
                        if (/^user/.test(ln.scope)) // skip opt for user-supplied assembly
                            continue;
                        let lnNext = mylines[i + 1];
                        if (!lnNext)
                            continue;
                        let lnNext2 = mylines[i + 2];
                        if (ln.type == "instruction") {
                            this.ei.peephole(ln, lnNext, lnNext2);
                        }
                    }
                }
                clearLabels() {
                    this.labels = {};
                    this.commPtr = 0;
                }
                peepPass(reallyFinal) {
                    if (this.disablePeepHole)
                        return;
                    this.peepOps = 0;
                    this.peepDel = 0;
                    this.peepCounts = {};
                    this.peepHole();
                    this.throwOnError = true;
                    this.finalEmit = false;
                    this.clearLabels();
                    this.iterLines();
                    pxtc.assert(!this.checkStack || this.stack == 0);
                    this.finalEmit = true;
                    this.reallyFinalEmit = reallyFinal || this.peepOps == 0;
                    this.iterLines();
                    this.stats += lf("; peep hole pass: {0} instructions removed and {1} updated\n", this.peepDel, this.peepOps - this.peepDel);
                }
                getLabels() {
                    if (!this.userLabelsCache)
                        this.userLabelsCache = pxtc.U.mapMap(this.labels, (k, v) => v + this.baseOffset);
                    return this.userLabelsCache;
                }
                emit(text) {
                    pxtc.assert(this.buf == null);
                    this.prepLines(text);
                    if (this.errors.length > 0)
                        return;
                    this.clearLabels();
                    this.iterLines();
                    if (this.checkStack && this.stack != 0)
                        this.directiveError(lf("stack misaligned at the end of the file"));
                    if (this.errors.length > 0)
                        return;
                    this.ei.expandLdlit(this);
                    this.clearLabels();
                    this.iterLines();
                    this.finalEmit = true;
                    this.reallyFinalEmit = this.disablePeepHole;
                    this.iterLines();
                    if (this.errors.length > 0)
                        return;
                    let maxPasses = 5;
                    for (let i = 0; i < maxPasses; ++i) {
                        pxt.debug(`Peephole OPT, pass ${i}`);
                        this.peepPass(i == maxPasses);
                        if (this.peepOps == 0)
                            break;
                    }
                    pxt.debug("emit done");
                }
            }
            assembler.File = File;
            class VMFile extends File {
                constructor(ei) {
                    super(ei);
                }
            }
            assembler.VMFile = VMFile;
            // an assembler provider must inherit from this
            // class and provide Encoders and Instructions
            class AbstractProcessor {
                constructor() {
                    this.file = null;
                    this.addEnc = (n, p, e) => {
                        let ee = {
                            name: n,
                            pretty: p,
                            encode: e,
                            isRegister: /^\$r\d/.test(n),
                            isImmediate: /^\$i\d/.test(n),
                            isRegList: /^\$rl\d/.test(n),
                            isLabel: /^\$l[a-z]/.test(n),
                        };
                        this.encoders[n] = ee;
                        return ee;
                    };
                    this.inrange = (max, v, e) => {
                        if (Math.floor(v) != v)
                            return null;
                        if (v < 0)
                            return null;
                        if (v > max)
                            return null;
                        return e;
                    };
                    this.inminmax = (min, max, v, e) => {
                        if (Math.floor(v) != v)
                            return null;
                        if (v < min)
                            return null;
                        if (v > max)
                            return null;
                        return e;
                    };
                    this.inseq = (seq, v) => {
                        let ind = seq.indexOf(v);
                        if (ind < 0)
                            return null;
                        return ind;
                    };
                    this.inrangeSigned = (max, v, e) => {
                        if (Math.floor(v) != v)
                            return null;
                        if (v < -(max + 1))
                            return null;
                        if (v > max)
                            return null;
                        let mask = (max << 1) | 1;
                        return e & mask;
                    };
                    this.addInst = (name, code, mask, is32Bit) => {
                        let ins = new Instruction(this, name, code, mask, is32Bit);
                        if (!this.instructions.hasOwnProperty(ins.name))
                            this.instructions[ins.name] = [];
                        this.instructions[ins.name].push(ins);
                        return ins;
                    };
                    this.encoders = {};
                    this.instructions = {};
                }
                toFnPtr(v, baseOff, lbl) {
                    return v;
                }
                wordSize() {
                    return -1;
                }
                computeStackOffset(kind, offset) {
                    return offset;
                }
                is32bit(i) {
                    return false;
                }
                emit32(v1, v2, actual) {
                    return null;
                }
                postProcessRelAddress(f, v) {
                    return v;
                }
                postProcessAbsAddress(f, v) {
                    return v;
                }
                peephole(ln, lnNext, lnNext2) {
                    return;
                }
                registerNo(actual) {
                    return null;
                }
                getAddressFromLabel(f, i, s, wordAligned = false) {
                    return null;
                }
                isPop(opcode) {
                    return false;
                }
                isPush(opcode) {
                    return false;
                }
                isAddSP(opcode) {
                    return false;
                }
                isSubSP(opcode) {
                    return false;
                }
                testAssembler() {
                    pxtc.assert(false);
                }
                expandLdlit(f) {
                }
            }
            assembler.AbstractProcessor = AbstractProcessor;
            // utility functions
            function tokenize(line) {
                let words = [];
                let w = "";
                loop: for (let i = 0; i < line.length; ++i) {
                    switch (line[i]) {
                        case "[":
                        case "]":
                        case "!":
                        case "{":
                        case "}":
                        case ",":
                            if (w) {
                                words.push(w);
                                w = "";
                            }
                            words.push(line[i]);
                            break;
                        case " ":
                        case "\t":
                        case "\r":
                        case "\n":
                            if (w) {
                                words.push(w);
                                w = "";
                            }
                            break;
                        case ";":
                            // drop the trailing comment
                            break loop;
                        default:
                            w += line[i];
                            break;
                    }
                }
                if (w) {
                    words.push(w);
                    w = "";
                }
                if (!words[0])
                    return null;
                return words;
            }
            function parseString(s) {
                s = s.replace(/\\\\/g, "\\B") // don't get confused by double backslash
                    .replace(/\\(['\?])/g, (f, q) => q) // these are not valid in JSON yet valid in C
                    .replace(/\\[z0]/g, "\u0000") // \0 is valid in C
                    .replace(/\\x([0-9a-f][0-9a-f])/gi, (f, h) => "\\u00" + h)
                    .replace(/\\B/g, "\\\\"); // undo anti-confusion above
                try {
                    return JSON.parse(s);
                }
                catch (e) {
                    return null;
                }
            }
            function emitErr(msg, tok) {
                return {
                    stack: null,
                    opcode: null,
                    error: msg,
                    errorAt: tok
                };
            }
            assembler.emitErr = emitErr;
            function testOne(ei, op, code) {
                let b = new File(ei);
                b.checkStack = false;
                b.emit(op);
                pxtc.assert(b.buf[0] == code);
            }
            function expectError(ei, asm) {
                let b = new File(ei);
                b.emit(asm);
                if (b.errors.length == 0) {
                    pxtc.oops("ASMTEST: expecting error for: " + asm);
                }
                // console.log(b.errors[0].message)
            }
            assembler.expectError = expectError;
            function tohex(n) {
                if (n < 0 || n > 0xffff)
                    return ("0x" + n.toString(16)).toLowerCase();
                else
                    return ("0x" + ("000" + n.toString(16)).slice(-4)).toLowerCase();
            }
            assembler.tohex = tohex;
            function expect(ei, disasm) {
                let exp = [];
                let asm = disasm.replace(/^([0-9a-fA-F]{4,8})\s/gm, (w, n) => {
                    exp.push(parseInt(n.slice(0, 4), 16));
                    if (n.length == 8)
                        exp.push(parseInt(n.slice(4, 8), 16));
                    return "";
                });
                let b = new File(ei);
                b.throwOnError = true;
                b.disablePeepHole = true;
                b.emit(asm);
                if (b.errors.length > 0) {
                    console.debug(b.errors[0].message);
                    pxtc.oops("ASMTEST: not expecting errors");
                }
                if (b.buf.length != exp.length)
                    pxtc.oops("ASMTEST: wrong buf len");
                for (let i = 0; i < exp.length; ++i) {
                    if (b.buf[i] != exp[i])
                        pxtc.oops("ASMTEST: wrong buf content at " + i + " , exp:" + tohex(exp[i]) + ", got: " + tohex(b.buf[i]));
                }
            }
            assembler.expect = expect;
        })(assembler = pxtc.assembler || (pxtc.assembler = {}));
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
/// <reference path="../../localtypings/projectheader.d.ts"/>
var pxt;
(function (pxt) {
    var Cloud;
    (function (Cloud) {
        var Util = pxtc.Util;
        Cloud.apiRoot = (pxt.BrowserUtils.isLocalHost() || Util.isNodeJS) ? "https://www.makecode.com/api/" : "/api/";
        Cloud.accessToken = "";
        Cloud.localToken = "";
        let _isOnline = true;
        Cloud.onOffline = () => { };
        function offlineError(url) {
            let e = new Error(Util.lf("Cannot access {0} while offline", url));
            e.isOffline = true;
            return pxt.U.delay(1000).then(() => Promise.reject(e));
        }
        function hasAccessToken() {
            return !!Cloud.accessToken;
        }
        Cloud.hasAccessToken = hasAccessToken;
        function localRequestAsync(path, data) {
            return pxt.U.requestAsync({
                url: "/api/" + path,
                headers: { "Authorization": Cloud.localToken },
                method: data ? "POST" : "GET",
                data: data || undefined,
                allowHttpErrors: true
            });
        }
        Cloud.localRequestAsync = localRequestAsync;
        function useCdnApi() {
            return pxt.webConfig && !pxt.webConfig.isStatic
                && !pxt.BrowserUtils.isLocalHost() && !!pxt.webConfig.cdnUrl;
        }
        Cloud.useCdnApi = useCdnApi;
        function cdnApiUrl(url) {
            url = url.replace(/^\//, '');
            if (!useCdnApi())
                return Cloud.apiRoot + url;
            const d = new Date();
            const timestamp = d.getUTCFullYear() + ("0" + (d.getUTCMonth() + 1)).slice(-2) + ("0" + d.getUTCDate()).slice(-2);
            if (url.indexOf("?") < 0)
                url += "?";
            else
                url += "&";
            url += "cdn=" + timestamp;
            // url = url.replace("?", "$")
            return pxt.webConfig.cdnUrl + "/api/" + url;
        }
        Cloud.cdnApiUrl = cdnApiUrl;
        function apiRequestWithCdnAsync(options) {
            if (!useCdnApi())
                return privateRequestAsync(options);
            options.url = cdnApiUrl(options.url);
            return Util.requestAsync(options)
                .catch(e => handleNetworkError(options, e));
        }
        Cloud.apiRequestWithCdnAsync = apiRequestWithCdnAsync;
        function handleNetworkError(options, e) {
            if (e.statusCode == 0) {
                if (_isOnline) {
                    _isOnline = false;
                    Cloud.onOffline();
                }
                return offlineError(options.url);
            }
            else {
                return Promise.reject(e);
            }
        }
        function privateRequestAsync(options) {
            var _a;
            options.url = ((_a = pxt.webConfig) === null || _a === void 0 ? void 0 : _a.isStatic) && !options.forceLiveEndpoint ? pxt.webConfig.relprefix + options.url : Cloud.apiRoot + options.url;
            options.allowGzipPost = true;
            if (!Cloud.isOnline() && !pxt.BrowserUtils.isPxtElectron()) {
                return offlineError(options.url);
            }
            if (!options.headers)
                options.headers = {};
            if (pxt.BrowserUtils.isLocalHost()) {
                if (Cloud.localToken)
                    options.headers["Authorization"] = Cloud.localToken;
            }
            else if (Cloud.accessToken) {
                options.headers["x-td-access-token"] = Cloud.accessToken;
            }
            return Util.requestAsync(options)
                .catch(e => handleNetworkError(options, e));
        }
        Cloud.privateRequestAsync = privateRequestAsync;
        function privateGetTextAsync(path, headers) {
            return privateRequestAsync({ url: path, headers }).then(resp => resp.text);
        }
        Cloud.privateGetTextAsync = privateGetTextAsync;
        function privateGetAsync(path, forceLiveEndpoint = false) {
            return privateRequestAsync({ url: path, forceLiveEndpoint }).then(resp => resp.json);
        }
        Cloud.privateGetAsync = privateGetAsync;
        function downloadTargetConfigAsync() {
            if (!Cloud.isOnline()) // offline
                return Promise.resolve(undefined);
            const targetVersion = pxt.appTarget.versions && pxt.appTarget.versions.target;
            const url = pxt.webConfig && pxt.webConfig.isStatic ? `targetconfig.json` : `config/${pxt.appTarget.id}/targetconfig${targetVersion ? `/v${targetVersion}` : ''}`;
            if (pxt.BrowserUtils.isLocalHost())
                return localRequestAsync(url).then(r => r ? r.json : undefined);
            else
                return apiRequestWithCdnAsync({ url }).then(r => r.json);
        }
        Cloud.downloadTargetConfigAsync = downloadTargetConfigAsync;
        function downloadScriptFilesAsync(id) {
            return privateRequestAsync({ url: id + "/text", forceLiveEndpoint: true }).then(resp => {
                return JSON.parse(resp.text);
            });
        }
        Cloud.downloadScriptFilesAsync = downloadScriptFilesAsync;
        // 1h check on markdown content if not on development server
        const MARKDOWN_EXPIRATION = pxt.BrowserUtils.isLocalHostDev() ? 0 : 1 * 60 * 60 * 1000;
        // 1w check don't use cached version and wait for new content
        const FORCE_MARKDOWN_UPDATE = MARKDOWN_EXPIRATION * 24 * 7;
        async function markdownAsync(docid, locale) {
            locale = locale || pxt.Util.userLanguage();
            const branch = "";
            const db = await pxt.BrowserUtils.translationDbAsync();
            const entry = await db.getAsync(locale, docid, branch);
            const downloadAndSetMarkdownAsync = async () => {
                try {
                    const r = await downloadMarkdownAsync(docid, locale, entry === null || entry === void 0 ? void 0 : entry.etag);
                    // TODO directly compare the entry/response etags after backend change
                    if (!entry || (r.md && entry.md !== r.md)) {
                        await db.setAsync(locale, docid, branch, r.etag, undefined, r.md);
                        return r.md;
                    }
                    return entry.md;
                }
                catch (_a) {
                    return ""; // no translation
                }
            };
            if (entry) {
                const timeDiff = Date.now() - entry.time;
                const shouldFetchInBackground = timeDiff > MARKDOWN_EXPIRATION;
                const shouldWaitForNewContent = timeDiff > FORCE_MARKDOWN_UPDATE;
                if (!shouldWaitForNewContent) {
                    if (shouldFetchInBackground) {
                        pxt.tickEvent("markdown.update.background");
                        // background update, do not wait
                        downloadAndSetMarkdownAsync();
                    }
                    // return cached entry
                    if (entry.md) {
                        return entry.md;
                    }
                }
                else {
                    pxt.tickEvent("markdown.update.wait");
                }
            }
            // download and cache
            return downloadAndSetMarkdownAsync();
        }
        Cloud.markdownAsync = markdownAsync;
        function downloadMarkdownAsync(docid, locale, etag) {
            var _a;
            const packaged = (_a = pxt.webConfig) === null || _a === void 0 ? void 0 : _a.isStatic;
            const targetVersion = pxt.appTarget.versions && pxt.appTarget.versions.target || '?';
            let url;
            if (packaged) {
                url = docid;
                const isUnderDocs = /\/?docs\//.test(url);
                const hasExt = /\.\w+$/.test(url);
                if (!isUnderDocs) {
                    const hasLeadingSlash = url[0] === "/";
                    url = `docs${hasLeadingSlash ? "" : "/"}${url}`;
                }
                if (!hasExt) {
                    url = `${url}.md`;
                }
            }
            else {
                url = `md/${pxt.appTarget.id}/${docid.replace(/^\//, "")}?targetVersion=${encodeURIComponent(targetVersion)}`;
            }
            if (!packaged && locale != "en") {
                url += `&lang=${encodeURIComponent(locale)}`;
            }
            if (pxt.BrowserUtils.isLocalHost() && !pxt.Util.liveLocalizationEnabled()) {
                return localRequestAsync(url).then(resp => {
                    if (resp.statusCode == 404)
                        return privateRequestAsync({ url, method: "GET" })
                            .then(resp => { return { md: resp.text, etag: resp.headers["etag"] }; });
                    else
                        return { md: resp.text, etag: undefined };
                });
            }
            else {
                const headers = etag && !useCdnApi() ? { "If-None-Match": etag } : undefined;
                return apiRequestWithCdnAsync({ url, method: "GET", headers })
                    .then(resp => { return { md: resp.text, etag: resp.headers["etag"] }; });
            }
        }
        function privateDeleteAsync(path) {
            return privateRequestAsync({ url: path, method: "DELETE" }).then(resp => resp.json);
        }
        Cloud.privateDeleteAsync = privateDeleteAsync;
        function privatePostAsync(path, data, forceLiveEndpoint = false) {
            return privateRequestAsync({ url: path, data: data || {}, forceLiveEndpoint }).then(resp => resp.json);
        }
        Cloud.privatePostAsync = privatePostAsync;
        function isLoggedIn() { return !!Cloud.accessToken; }
        Cloud.isLoggedIn = isLoggedIn;
        function isNavigatorOnline() {
            return navigator && navigator.onLine;
        }
        Cloud.isNavigatorOnline = isNavigatorOnline;
        function isOnline() {
            if (typeof navigator !== "undefined" && isNavigatorOnline()) {
                _isOnline = true;
            }
            return _isOnline;
        }
        Cloud.isOnline = isOnline;
        function getServiceUrl() {
            return Cloud.apiRoot.replace(/\/api\/$/, "");
        }
        Cloud.getServiceUrl = getServiceUrl;
        function getUserId() {
            let m = /^0(\w+)\./.exec(Cloud.accessToken);
            if (m)
                return m[1];
            return null;
        }
        Cloud.getUserId = getUserId;
        function parseScriptId(uri) {
            const target = pxt.appTarget;
            if (!uri || !target.appTheme || !target.cloud || !target.cloud.sharing)
                return undefined;
            let domains = ["makecode.com"];
            if (target.appTheme.embedUrl)
                domains.push(target.appTheme.embedUrl);
            if (target.appTheme.shareUrl)
                domains.push(target.appTheme.shareUrl);
            domains = Util.unique(domains, d => d).map(d => Util.escapeForRegex(Util.stripUrlProtocol(d).replace(/\/$/, '')).toLowerCase());
            const rx = `^((https:\/\/)?(?:${domains.join('|')})\/)?(?:v[0-9]+\/)?(api\/oembed\?url=.*%2F([^&]*)&.*?|([a-z0-9\-_]+))$`;
            const m = new RegExp(rx, 'i').exec(uri.trim());
            const scriptid = m && (!m[1] || domains.indexOf(Util.escapeForRegex(m[1].replace(/https:\/\//, '').replace(/\/$/, '')).toLowerCase()) >= 0) && (m[3] || m[4]) ? (m[3] ? m[3] : m[4]) : null;
            if (!scriptid)
                return undefined;
            if (scriptid[0] == "_" && scriptid.length == 13)
                return scriptid;
            if (scriptid.length == 23 && /^[0-9\-]+$/.test(scriptid))
                return scriptid;
            return undefined;
        }
        Cloud.parseScriptId = parseScriptId;
    })(Cloud = pxt.Cloud || (pxt.Cloud = {}));
})(pxt || (pxt = {}));
var ts;
(function (ts) {
    var pxtc;
    (function (pxtc) {
        function f4EncodeImg(w, h, bpp, getPix) {
            const header = [
                0x87, bpp,
                w & 0xff, w >> 8,
                h & 0xff, h >> 8,
                0, 0
            ];
            let r = header.map(hex2).join("");
            let ptr = 4;
            let curr = 0;
            let shift = 0;
            let pushBits = (n) => {
                curr |= n << shift;
                if (shift == 8 - bpp) {
                    r += hex2(curr);
                    ptr++;
                    curr = 0;
                    shift = 0;
                }
                else {
                    shift += bpp;
                }
            };
            for (let i = 0; i < w; ++i) {
                for (let j = 0; j < h; ++j)
                    pushBits(getPix(i, j));
                while (shift != 0)
                    pushBits(0);
                if (bpp > 1) {
                    while (ptr & 3)
                        pushBits(0);
                }
            }
            return r;
            function hex2(n) {
                return ("0" + n.toString(16)).slice(-2);
            }
        }
        pxtc.f4EncodeImg = f4EncodeImg;
    })(pxtc = ts.pxtc || (ts.pxtc = {}));
})(ts || (ts = {}));
var pxtmelody;
(function (pxtmelody) {
    class MelodyArray {
        // constructor
        constructor(tempo) {
            this.numCols = 8;
            this.numRows = 8;
            // Whether or now the melody can contain more than one note at a single beat
            this.polyphonic = false;
            if (tempo)
                this.tempo = tempo;
            // set all elements to false
            this.resetMelody();
        }
        setTempo(tempo) {
            this.tempo = tempo;
        }
        getArray() {
            return this.melody;
        }
        setArray(array) {
            this.melody = array;
        }
        getColor(row) {
            // TODO
            return 0;
        }
        getValue(row, col) {
            return this.melody[row][col];
        }
        getWidth() {
            return this.numCols;
        }
        getHeight() {
            return this.numRows;
        }
        updateMelody(row, col) {
            const newValue = !this.melody[row][col];
            if (newValue && !this.polyphonic) {
                for (let r = 0; r < this.numRows; r++) {
                    this.melody[r][col] = false;
                }
            }
            this.melody[row][col] = newValue;
        }
        // function to turn into string
        getStringRepresentation() {
            let stringMelody = "";
            let queues = new Array(this.numCols);
            let numMelodies = 0;
            // create queues of notes
            for (let i = 0; i < this.numRows; i++) {
                let noteCount = 0;
                queues[i] = [];
                for (let j = 0; j < this.numCols; j++) {
                    if (this.melody[j][i]) {
                        queues[i].push(rowToNote(j));
                        noteCount++;
                    }
                }
                if (noteCount > numMelodies) {
                    numMelodies = noteCount;
                }
            }
            // create strings of melodies
            if (numMelodies == 0)
                return "- - - - - - - - ";
            for (let j = 0; j < numMelodies; j++) {
                for (let i = 0; i < this.numCols; i++) {
                    if (queues[i] && queues[i].length > 0) { // if there is an element
                        stringMelody += queues[i].shift() + " ";
                    }
                    else {
                        stringMelody += "- "; // add rest if there is no selection for the note
                    }
                }
                //stringMelody += "."; // this will be used to split each melody
            }
            return stringMelody;
        }
        // turn string into boolean array
        parseNotes(stringNotes) {
            // A melody is represented as a string of notes separated by spaces, with dashes representing rests
            // ex: a scale is represented as "C5 B A G F E D C"
            stringNotes = stringNotes.trim();
            let notes = stringNotes.split(" ");
            for (let i = 0; i < notes.length; i++) {
                for (let j = 0; j < this.numRows; j++) {
                    // reset everything to false
                    this.melody[j][i] = false;
                }
                if (notes[i] != "-") {
                    this.melody[noteToRow(notes[i])][i] = true;
                }
            }
        }
        setPolyphonic(isPolyphonic) {
            this.polyphonic = isPolyphonic;
        }
        isPolyphonic() {
            return this.polyphonic;
        }
        resetMelody() {
            this.melody = new Array(this.numCols);
            for (let i = 0; i < this.numCols; i++) {
                this.melody[i] = new Array(this.numRows).fill(false);
            }
        }
    }
    pxtmelody.MelodyArray = MelodyArray;
    function rowToNote(rowNum) {
        let note = "";
        switch (rowNum) {
            case 0:
                note = "C5";
                break;
            case 1:
                note = "B";
                break;
            case 2:
                note = "A";
                break;
            case 3:
                note = "G";
                break;
            case 4:
                note = "F";
                break;
            case 5:
                note = "E";
                break;
            case 6:
                note = "D";
                break;
            case 7:
                note = "C";
                break;
        }
        return note;
    }
    pxtmelody.rowToNote = rowToNote;
    function noteToRow(note) {
        let rowNum = -1;
        switch (note) {
            case "C5":
                rowNum = 0;
                break;
            case "B":
                rowNum = 1;
                break;
            case "A":
                rowNum = 2;
                break;
            case "G":
                rowNum = 3;
                break;
            case "F":
                rowNum = 4;
                break;
            case "E":
                rowNum = 5;
                break;
            case "D":
                rowNum = 6;
                break;
            case "C":
                rowNum = 7;
                break;
        }
        return rowNum;
    }
    pxtmelody.noteToRow = noteToRow;
    function getColorClass(row) {
        let colorClass = "melody-default";
        switch (row) {
            case 0:
                colorClass = "melody-red";
                break; // Middle C
            case 1:
                colorClass = "melody-orange";
                break; // Middle D
            case 2:
                colorClass = "melody-yellow";
                break; // Middle E
            case 3:
                colorClass = "melody-green";
                break; // Middle F
            case 4:
                colorClass = "melody-teal";
                break; // Middle G
            case 5:
                colorClass = "melody-blue";
                break; // Middle A
            case 6:
                colorClass = "melody-purple";
                break; // Middle B
            case 7:
                colorClass = "melody-violet";
                break; // Tenor C
        }
        return colorClass;
    }
    pxtmelody.getColorClass = getColorClass;
})(pxtmelody || (pxtmelody = {}));
var pxtmelody;
(function (pxtmelody) {
    class MelodyGallery {
        constructor() {
            this.value = null;
            this.visible = false;
            this.timeouts = []; // keep track of timeout
            this.numSamples = pxtmelody.SampleMelodies.length;
            this.containerDiv = document.createElement("div");
            this.containerDiv.setAttribute("id", "melody-editor-gallery-outer");
            this.contentDiv = document.createElement("div");
            this.contentDiv.setAttribute("id", "melody-editor-gallery");
            this.itemBackgroundColor = "#DCDCDC";
            this.itemBorderColor = "white";
            this.initStyles();
            this.containerDiv.appendChild(this.contentDiv);
            this.containerDiv.style.display = "none";
            this.contentDiv.addEventListener("animationend", () => {
                if (!this.visible) {
                    this.containerDiv.style.display = "none";
                }
            });
            this.contentDiv.addEventListener('wheel', e => {
                e.stopPropagation();
            }, true);
        }
        getElement() {
            return this.containerDiv;
        }
        getValue() {
            return this.value;
        }
        show(notes) {
            this.pending = notes;
            this.containerDiv.style.display = "block";
            this.buildDom();
            this.visible = true;
            pxt.BrowserUtils.removeClass(this.contentDiv, "hidden-above");
            pxt.BrowserUtils.addClass(this.contentDiv, "shown");
        }
        hide() {
            this.visible = false;
            pxt.BrowserUtils.removeClass(this.contentDiv, "shown");
            pxt.BrowserUtils.addClass(this.contentDiv, "hidden-above");
            this.value = null;
            this.stopMelody();
        }
        clearDomReferences() {
            this.contentDiv = null;
            this.containerDiv = null;
        }
        layout(left, top, height) {
            this.containerDiv.style.left = left + "px";
            this.containerDiv.style.top = top + "px";
            this.containerDiv.style.height = height + "px";
        }
        buildDom() {
            while (this.contentDiv.firstChild)
                this.contentDiv.removeChild(this.contentDiv.firstChild);
            const buttonWidth = "255px";
            const buttonHeight = "45px";
            const samples = pxtmelody.SampleMelodies;
            this.buttons = [];
            for (let i = 0; i < samples.length; i++) {
                this.mkButton(samples[i], i, buttonWidth, buttonHeight);
            }
        }
        initStyles() {
            // Style injected directly because animations are mangled by the less compiler
            const style = document.createElement("style");
            style.textContent = `
            #melody-editor-gallery {
                margin-top: -100%;
            }

            #melody-editor-gallery.hidden-above {
                margin-top: -100%;
                animation: slide-up 0.2s 0s ease;
            }

            #melody-editor-gallery.shown {
                margin-top: 0px;
                animation: slide-down 0.2s 0s ease;
            }

            @keyframes slide-down {
                0% {
                    margin-top: -100%;
                }
                100% {
                    margin-top: 0px;
                }
            }

            @keyframes slide-up {
                0% {
                    margin-top: 0px;
                }
                100% {
                    margin-top: -100%;
                }
            }
            `;
            this.containerDiv.appendChild(style);
        }
        mkButton(sample, i, width, height) {
            const outer = mkElement("div", {
                className: "melody-gallery-button melody-editor-card",
                role: "menuitem",
                id: `:${i}`
            });
            const icon = mkElement("i", {
                className: "music icon melody-icon"
            });
            const label = mkElement("div", {
                className: "melody-editor-text"
            });
            label.innerText = sample.name;
            const preview = this.createColorBlock(sample);
            const leftButton = mkElement("div", {
                className: "melody-editor-button left-button",
                role: "button",
                title: sample.name
            }, () => this.handleSelection(sample));
            leftButton.appendChild(icon);
            leftButton.appendChild(label);
            leftButton.appendChild(preview);
            outer.appendChild(leftButton);
            const rightButton = mkElement("div", {
                className: "melody-editor-button right-button",
                role: "button",
                title: lf("Preview {0}", sample.name)
            }, () => this.togglePlay(sample, i));
            const playIcon = mkElement("i", {
                className: "play icon"
            });
            this.buttons[i] = playIcon;
            rightButton.appendChild(playIcon);
            outer.appendChild(rightButton);
            this.contentDiv.appendChild(outer);
        }
        handleSelection(sample) {
            if (this.pending) {
                const notes = this.pending;
                this.pending = undefined;
                notes(sample.notes);
            }
        }
        playNote(note, colNumber, tempo) {
            let tone = 0;
            switch (note) {
                case "C5":
                    tone = 523;
                    break; // Tenor C
                case "B":
                    tone = 494;
                    break; // Middle B
                case "A":
                    tone = 440;
                    break; // Middle A
                case "G":
                    tone = 392;
                    break; // Middle G
                case "F":
                    tone = 349;
                    break; // Middle F
                case "E":
                    tone = 330;
                    break; // Middle E
                case "D":
                    tone = 294;
                    break; // Middle D
                case "C":
                    tone = 262;
                    break; // Middle C
            }
            // start note
            this.timeouts.push(setTimeout(() => {
                pxt.AudioContextManager.tone(tone);
            }, colNumber * this.getDuration(tempo)));
            // stop note
            this.timeouts.push(setTimeout(() => {
                pxt.AudioContextManager.stop();
            }, (colNumber + 1) * this.getDuration(tempo)));
        }
        // ms to hold note
        getDuration(tempo) {
            return 60000 / tempo;
        }
        previewMelody(sample) {
            // stop playing any other melody
            this.stopMelody();
            let notes = sample.notes.split(" ");
            for (let i = 0; i < notes.length; i++) {
                this.playNote(notes[i], i, sample.tempo);
            }
        }
        togglePlay(sample, i) {
            let button = this.buttons[i];
            if (pxt.BrowserUtils.containsClass(button, "play icon")) {
                // check for other stop icons and toggle back to play
                this.resetPlayIcons();
                pxt.BrowserUtils.removeClass(button, "play icon");
                pxt.BrowserUtils.addClass(button, "stop icon");
                this.previewMelody(sample);
                // make icon toggle back to play when the melody finishes
                this.timeouts.push(setTimeout(() => {
                    pxt.BrowserUtils.removeClass(button, "stop icon");
                    pxt.BrowserUtils.addClass(button, "play icon");
                }, (sample.notes.split(" ").length) * this.getDuration(sample.tempo)));
            }
            else {
                pxt.BrowserUtils.removeClass(button, "stop icon");
                pxt.BrowserUtils.addClass(button, "play icon");
                this.stopMelody();
            }
        }
        stopMelody() {
            while (this.timeouts.length)
                clearTimeout(this.timeouts.shift());
            pxt.AudioContextManager.stop();
        }
        resetPlayIcons() {
            for (let i = 0; i < this.numSamples; i++) {
                let button = this.buttons[i];
                if (pxt.BrowserUtils.containsClass(button, "stop icon")) {
                    pxt.BrowserUtils.removeClass(button, "stop icon");
                    pxt.BrowserUtils.addClass(button, "play icon");
                    break;
                }
            }
        }
        // create color representation of melody
        createColorBlock(sample) {
            let colorBlock = document.createElement("div");
            pxt.BrowserUtils.addClass(colorBlock, "melody-color-block");
            let notes = sample.notes.split(" ");
            for (let i = 0; i < notes.length; i++) {
                let className = pxtmelody.getColorClass(pxtmelody.noteToRow(notes[i]));
                let colorDiv = document.createElement("div");
                // create rounded effect on edge divs and fill in color
                if (i == 0) {
                    pxt.BrowserUtils.addClass(colorDiv, "left-edge sliver " + className);
                }
                else if (i == notes.length - 1) {
                    pxt.BrowserUtils.addClass(colorDiv, "right-edge sliver " + className);
                }
                else {
                    pxt.BrowserUtils.addClass(colorDiv, "sliver " + className);
                }
                colorBlock.appendChild(colorDiv);
            }
            return colorBlock;
        }
    }
    pxtmelody.MelodyGallery = MelodyGallery;
    function mkElement(tag, props, onClick) {
        const el = document.createElement(tag);
        return initElement(el, props, onClick);
    }
    function initElement(el, props, onClick) {
        if (props) {
            for (const key of Object.keys(props)) {
                if (key === "className")
                    el.setAttribute("class", props[key] + "");
                else
                    el.setAttribute(key, props[key] + "");
            }
        }
        if (onClick) {
            el.addEventListener("click", onClick);
        }
        return el;
    }
})(pxtmelody || (pxtmelody = {}));
var pxtmelody;
(function (pxtmelody) {
    class MelodyInfo {
        constructor(name, notes, tempo) {
            this.name = name;
            this.notes = notes;
            this.tempo = tempo;
        }
    }
    pxtmelody.MelodyInfo = MelodyInfo;
    pxtmelody.SampleMelodies = [
        new MelodyInfo(lf("Scale"), "C5 B A G F E D C", 120),
        new MelodyInfo(lf("Reverse"), "C D E F G A B C5", 120),
        new MelodyInfo(lf("Mystery"), "E B C5 A B G A F", 120),
        new MelodyInfo(lf("Gilroy"), "A F E F D G E F", 120),
        new MelodyInfo(lf("Falling"), "C5 A B G A F G E", 120),
        new MelodyInfo(lf("Hopeful"), "G B A G C5 B A B", 120),
        new MelodyInfo(lf("Tokyo"), "B A G A G F A C5", 120),
        new MelodyInfo(lf("Paris"), "G F G A - F E D", 120),
        new MelodyInfo(lf("Rising"), "E D G F B A C5 B", 120),
        new MelodyInfo(lf("Sitka"), "C5 G B A F A C5 B", 120)
    ];
})(pxtmelody || (pxtmelody = {}));
