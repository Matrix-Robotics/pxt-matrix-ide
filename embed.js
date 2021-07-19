(function() {
    if (window.ksRunnerInit) return;

    // This line gets patched up by the cloud
    var pxtConfig = {
    "relprefix": "/pxt-matrix-ide/",
    "verprefix": "",
    "workerjs": "/pxt-matrix-ide/worker.js",
    "monacoworkerjs": "/pxt-matrix-ide/monacoworker.js",
    "gifworkerjs": "/pxt-matrix-ide/gifjs/gif.worker.js",
    "serviceworkerjs": "/pxt-matrix-ide/serviceworker.js",
    "typeScriptWorkerJs": "/pxt-matrix-ide/tsworker.js",
    "pxtVersion": "7.1.3",
    "pxtRelId": "localDirRelId",
    "pxtCdnUrl": "/pxt-matrix-ide/",
    "commitCdnUrl": "/pxt-matrix-ide/",
    "blobCdnUrl": "/pxt-matrix-ide/",
    "cdnUrl": "/pxt-matrix-ide/",
    "targetVersion": "0.0.0",
    "targetRelId": "",
    "targetUrl": "",
    "targetId": "matrix",
    "simUrl": "/pxt-matrix-ide/simulator.html",
    "simserviceworkerUrl": "/pxt-matrix-ide/simulatorserviceworker.js",
    "simworkerconfigUrl": "/pxt-matrix-ide/workerConfig.js",
    "partsUrl": "/pxt-matrix-ide/siminstructions.html",
    "runUrl": "/pxt-matrix-ide/run.html",
    "docsUrl": "/pxt-matrix-ide/docs.html",
    "multiUrl": "/pxt-matrix-ide/multi.html",
    "asseteditorUrl": "/pxt-matrix-ide/asseteditor.html",
    "skillmapUrl": "/pxt-matrix-ide/skillmap.html",
    "isStatic": true
};

    var scripts = [
        "/pxt-matrix-ide/highlight.js/highlight.pack.js",
        "/pxt-matrix-ide/marked/marked.min.js",
    ]

    if (typeof jQuery == "undefined")
        scripts.unshift("/pxt-matrix-ide/jquery.js")
    if (typeof jQuery == "undefined" || !jQuery.prototype.sidebar)
        scripts.push("/pxt-matrix-ide/semantic.js")
    if (!window.pxtTargetBundle)
        scripts.push("/pxt-matrix-ide/target.js");
    scripts.push("/pxt-matrix-ide/pxtembed.js");

    var pxtCallbacks = []

    window.ksRunnerReady = function(f) {
        if (pxtCallbacks == null) f()
        else pxtCallbacks.push(f)
    }

    window.ksRunnerWhenLoaded = function() {
        pxt.docs.requireHighlightJs = function() { return hljs; }
        pxt.setupWebConfig(pxtConfig || window.pxtWebConfig)
        pxt.runner.initCallbacks = pxtCallbacks
        pxtCallbacks.push(function() {
            pxtCallbacks = null
        })
        pxt.runner.init();
    }

    scripts.forEach(function(src) {
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.head.appendChild(script);
    })

} ())
