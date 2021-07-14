# MakeCode for MATRIX Boards

This is an experimental code editor for Matrix boards.

## TODOs

- [ ] Modified PXT cli local build for customized front-end layout, instead of using global release package.
- [ ] Added libs for sensor/motor modules.
- [ ] Update the JavaScript runtime in ``sim/simulator.ts``. If needed add additional JS library under ``sim/public/**``
and edit ``sim/public/simulator.html`` with additional ``script`` tags.
- [ ] Update the APIs in ``sim/api.ts`` to use runtime.

## Running locally

These instructions allow to run locally to modify the sample.

### Setup

The following commands are a 1-time setup after synching the repo on your machine.

* install [node.js](https://nodejs.org/en/)

* install the PXT command line
```
npm install -g pxt  // TODO, local build
```
* install the dependencies
```
npm install
```

### Running the local server

After you're done, simple run this command to open a local web server:
```
pxt serve
```

After making a change in the source, refresh the page in the browser.

## Updating the tools

If you would like to pick up the latest PXT build, simply run
```
pxt update
```

More instructions at https://github.com/Microsoft/pxt#running-a-target-from-localhost 
