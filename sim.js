/// <reference path="../node_modules/pxt-core/built/pxtsim.d.ts"/>
/// <reference path="../node_modules/pxt-core/localtypings/pxtarget.d.ts"/>
/// <reference path="../built/common-sim.d.ts"/>
var pxsim;
(function (pxsim) {
    function pinByName(name) {
        let v = pxsim.pinIds[name];
        if (v == null) {
            v = pxsim.getConfig(pxsim.getConfigKey("PIN_" + name));
        }
        let p = pxsim.pxtcore.getPin(v);
        if (!p)
            console.error("missing pin: " + name + "(" + v + ")");
        return p;
    }
    pxsim.pinByName = pinByName;
    class DalBoard extends pxsim.CoreBoard {
        constructor(boardDefinition) {
            super();
            this.boardDefinition = boardDefinition;
            const pinList = [];
            const servos = {};
            function pinId(name) {
                let key = pxsim.getConfigKey("PIN_" + name);
                if (key != null)
                    return pxsim.getConfig(key);
                // this is for P03 format used by NRF - these are direct names of CPU pins
                let m = /^P(\d+)$/.exec(name);
                if (m)
                    return parseInt(m[1]);
                return null;
            }
            pxsim.pinIds = {};
            for (let block of boardDefinition.visual.pinBlocks) {
                // scan labels
                for (let lbl of block.labels) {
                    for (let sublbl of lbl.split(/[\/,]/)) {
                        sublbl = sublbl.replace(/[~\s]+/g, "");
                        let id = pinId(sublbl);
                        if (id != null) {
                            if (pinList.indexOf(id) < 0) {
                                pinList.push(id);
                                if ((2 /* PA02 */ <= id && id <= 11 /* PA11 */) ||
                                    (32 /* PB00 */ <= id && id <= 41 /* PB09 */))
                                    servos[sublbl] = id;
                            }
                            pxsim.pinIds[lbl] = id;
                            pxsim.pinIds[sublbl] = id;
                        }
                    }
                }
            }
            // also add pins that might not have visual representation
            for (let k of pxsim.getAllConfigKeys()) {
                if (/^PIN_/.test(k)) {
                    let id = pxsim.getConfig(pxsim.getConfigKey(k));
                    if (id != null) {
                        if (pinList.indexOf(id) < 0)
                            pinList.push(id);
                        pxsim.pinIds[k.replace(/^PIN_/, "")] = id;
                    }
                }
            }
            this.lightState = {};
            this.microphoneState = new pxsim.AnalogSensorState(3001 /* DEVICE_ID_MICROPHONE */, 52, 120, 75, 96);
            this.storageState = new pxsim.StorageState();
            this.lightSensorState = new pxsim.AnalogSensorState(17 /* DEVICE_ID_LIGHT_SENSOR */, 0, 255, 128 / 4, 896 / 4);
            this.thermometerState = new pxsim.AnalogSensorState(8 /* DEVICE_ID_THERMOMETER */, -20, 50, 10, 30);
            this.thermometerUnitState = pxsim.TemperatureUnit.Celsius;
            this.irState = new pxsim.InfraredState(this);
            this.lcdState = new pxsim.LCDState();
            this.controlMessageState = new pxsim.ControlMessageState(this);
            this.bus.setNotify(1023 /* DEVICE_ID_NOTIFY */, 1022 /* DEVICE_ID_NOTIFY_ONE */);
            // TODO we need this.buttonState set for pxtcore.getButtonByPin(), but
            // this should be probably merged with buttonpair somehow
            this.builtinParts["radio"] = this.radioState = new pxsim.RadioState(pxsim.runtime, this, {
                ID_RADIO: 9 /* DEVICE_ID_RADIO */,
                RADIO_EVT_DATAGRAM: 1 /*DAL.DEVICE_RADIO_EVT_DATAGRAM*/
            });
            this.builtinParts["pinbuttons"] = this.builtinParts["buttons"]
                = this.buttonState = new pxsim.CommonButtonState();
            this.builtinParts["touch"] = this.touchButtonState = new pxsim.TouchButtonState(pinList);
            // components
            this.builtinParts["audio"] = this.audioState = new pxsim.AudioState();
            this.builtinParts["edgeconnector"] = this.edgeConnectorState = new pxsim.EdgeConnectorState({
                pins: pinList,
                servos
            });
            this.builtinParts["microservo"] = this.edgeConnectorState;
            this.builtinParts["accelerometer"] = this.accelerometerState = new pxsim.AccelerometerState(pxsim.runtime);
            ;
            this.builtinParts["screen"] = this.screenState = new pxsim.ScreenState([], pxsim.getConfig(37 /* CFG_DISPLAY_WIDTH */) || 160, pxsim.getConfig(38 /* CFG_DISPLAY_HEIGHT */) || 128);
            this.builtinVisuals["buttons"] = () => new pxsim.visuals.ButtonView();
            this.builtinVisuals["microservo"] = () => new pxsim.visuals.MicroServoView();
            this.builtinParts["neopixel"] = (pin) => { return this.neopixelState(pin.id); };
            this.builtinVisuals["neopixel"] = () => new pxsim.visuals.NeoPixelView(parsePinString);
            this.builtinPartVisuals["neopixel"] = (xy) => pxsim.visuals.mkNeoPixelPart(xy);
            this.builtinParts["dotstar"] = (pin) => { return this.neopixelState(pin.id); };
            this.builtinVisuals["dotstar"] = () => new pxsim.visuals.NeoPixelView(parsePinString);
            this.builtinPartVisuals["dotstar"] = (xy) => pxsim.visuals.mkNeoPixelPart(xy);
            this.builtinParts["lcd"] = this.lcdState;
            this.builtinVisuals["lcd"] = () => new pxsim.visuals.LCDView();
            this.builtinPartVisuals["lcd"] = (xy) => pxsim.visuals.mkLCDPart(xy);
            this.builtinPartVisuals["buttons"] = (xy) => pxsim.visuals.mkBtnSvg(xy);
            this.builtinPartVisuals["microservo"] = (xy) => pxsim.visuals.mkMicroServoPart(xy);
            this.builtinParts["slideswitch"] = (pin) => new pxsim.ToggleState(pin);
            this.builtinVisuals["slideswitch"] = () => new pxsim.visuals.ToggleComponentVisual(parsePinString);
            this.builtinPartVisuals["slideswitch"] = (xy) => pxsim.visuals.mkSideSwitchPart(xy);
            this.builtinParts["led"] = (pin) => new pxsim.ToggleState(pin);
            this.builtinVisuals["led"] = () => new pxsim.visuals.LedView(parsePinString);
            this.builtinPartVisuals["led"] = (xy) => pxsim.visuals.mkLedPart(xy);
            this.builtinVisuals["photocell"] = () => new pxsim.visuals.PhotoCellView(parsePinString);
            this.builtinPartVisuals["photocell"] = (xy) => pxsim.visuals.mkPhotoCellPart(xy);
            this.builtinVisuals["screen"] = () => new pxsim.visuals.ScreenView();
            this.builtinPartVisuals["screen"] = (xy) => pxsim.visuals.mkScreenPart(xy);
            this.neopixelPin = this.edgeConnectorState.getPin(pxsim.getConfig(220 /* CFG_PIN_ONBOARD_DOTSTAR_DATA */))
                || this.edgeConnectorState.getPin(pxsim.getConfig(222 /* CFG_PIN_ONBOARD_NEOPIXEL */))
                || this.edgeConnectorState.getPin(pxsim.getConfig(8 /* CFG_PIN_DOTSTAR_DATA */))
                || this.edgeConnectorState.getPin(pxsim.getConfig(20 /* CFG_PIN_NEOPIXEL */));
            this.builtinParts["pixels"] = (pin) => { return this.neopixelState(!!this.neopixelPin && this.neopixelPin.id); };
            this.builtinVisuals["pixels"] = () => new pxsim.visuals.NeoPixelView(parsePinString);
            this.builtinPartVisuals["pixels"] = (xy) => pxsim.visuals.mkNeoPixelPart(xy);
        }
        kill() {
            super.kill();
            pxsim.AudioContextManager.stop();
        }
        initAsync(msg) {
            super.initAsync(msg);
            const options = (msg.options || {});
            const boardDef = msg.boardDefinition;
            const cmpsList = msg.parts;
            cmpsList.sort();
            const cmpDefs = msg.partDefinitions || {};
            const fnArgs = msg.fnArgs;
            const opts = {
                state: this,
                boardDef: boardDef,
                partsList: cmpsList,
                partDefs: cmpDefs,
                fnArgs: fnArgs,
                maxWidth: "100%",
                maxHeight: "100%",
            };
            this.viewHost = new pxsim.visuals.BoardHost(pxsim.visuals.mkBoardView({
                visual: boardDef.visual,
                boardDef
            }), opts);
            document.body.innerHTML = ""; // clear children
            document.body.appendChild(this.view = this.viewHost.getView());
            this.accelerometerState.attachEvents(this.view);
            return Promise.resolve();
        }
        screenshotAsync(width) {
            return this.viewHost.screenshotAsync(width);
        }
        accelerometer() {
            return this.accelerometerState.accelerometer;
        }
        getDefaultPitchPin() {
            // amp always on PA02, regardless which name is has
            return pxsim.pxtcore.getPin(2 /* PA02 */);
        }
        tryGetNeopixelState(pinId) {
            return this.lightState[pinId];
        }
        neopixelState(pinId) {
            if (pinId === undefined) {
                pinId = pxsim.pxtcore.getConfig(19 /* CFG_PIN_MOSI */, -1);
            }
            let state = this.lightState[pinId];
            if (!state)
                state = this.lightState[pinId] = new pxsim.CommonNeoPixelState();
            return state;
        }
    }
    pxsim.DalBoard = DalBoard;
    function initRuntimeWithDalBoard(msg) {
        pxsim.U.assert(!pxsim.runtime.board);
        let b = new DalBoard(msg.boardDefinition);
        pxsim.runtime.board = b;
        pxsim.runtime.postError = (e) => {
            // TODO
            pxsim.runtime.updateDisplay();
        };
    }
    pxsim.initRuntimeWithDalBoard = initRuntimeWithDalBoard;
    if (!pxsim.initCurrentRuntime) {
        pxsim.initCurrentRuntime = initRuntimeWithDalBoard;
    }
    function parsePinString(pinString) {
        const pinName = pinString && pxsim.readPin(pinString);
        return pinName && pxsim.pxtcore.getPin(pxsim.pinIds[pinName]);
    }
    pxsim.parsePinString = parsePinString;
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        const svg = pxsim.svg;
        visuals.VIEW_WIDTH = 372.3404255319149;
        visuals.VIEW_HEIGHT = 361.70212765957444;
        const TOP_MARGIN = 20;
        const MID_MARGIN = 40;
        const BOT_MARGIN = 20;
        const PIN_LBL_SIZE = visuals.PIN_DIST * 0.7;
        const PIN_LBL_HOVER_SIZE = PIN_LBL_SIZE * 1.5;
        const SQUARE_PIN_WIDTH = visuals.PIN_DIST * 0.66666;
        const SQUARE_PIN_HOVER_WIDTH = visuals.PIN_DIST * 0.66666 + visuals.PIN_DIST / 3.0;
        const STYLE = `
.sim-board-pin {
    stroke: #404040;
    fill: #000000;
}
.sim-board-button {
    stroke: #aaa;
    stroke-width: 3px;
    fill: #666;
}
.sim-board-button.pressed {
    fill: #ee0;
}
.sim-board-button:hover {
    stroke-width: 4px;
    stroke: #ee0;
    cursor: pointer;
}
    `;
        visuals.themes = ["#3ADCFE"].map(accent => {
            return {
                accent: accent,
                pin: "#D4AF37",
                pinTouched: "#FFA500",
                pinActive: "#FF5500",
                ledOn: "#ff7777",
                ledOff: "#fff",
                buttonOuter: "#979797",
                buttonUps: ["#000", "#000", "#000"],
                buttonDown: "#FFA500",
                virtualButtonDown: "#FFA500",
                virtualButtonOuter: "#333",
                virtualButtonUp: "#fff",
                lightLevelOn: "yellow",
                lightLevelOff: "#555",
                soundLevelOn: "#7f8c8d",
                soundLevelOff: "#555",
            };
        });
        function randomTheme() {
            return visuals.themes[Math.floor(Math.random() * visuals.themes.length)];
        }
        visuals.randomTheme = randomTheme;
        function getBoardDimensions(vis) {
            let scaleFn = (n) => n * (visuals.PIN_DIST / vis.pinDist);
            let width = scaleFn(vis.width);
            return {
                scaleFn: scaleFn,
                height: scaleFn(vis.height),
                width: width,
                xOff: (visuals.VIEW_WIDTH - width) / 2.0,
                yOff: TOP_MARGIN
            };
        }
        visuals.getBoardDimensions = getBoardDimensions;
        class MetroBoardSvg extends visuals.GenericBoardSvg {
            constructor(props) {
                super(props);
                this.props = props;
                const el = this.getView().el;
                this.addDefs(el);
                this.onBoardLeds = [];
                this.onBoardNeopixels = [];
                this.onBoardTouchPads = [];
                this.onBoardButtons = [];
                // neopixels/leds
                for (const l of props.visualDef.leds || []) {
                    if (l.color == "neopixel") {
                        const onBoardNeopixel = new BoardNeopixel(l.label, l.x, l.y, l.w || 0);
                        this.onBoardNeopixels.push(onBoardNeopixel);
                        el.appendChild(onBoardNeopixel.element);
                    }
                    else {
                        const pin = pxsim.pinByName(l.label);
                        if (pin) {
                            let bl = new BoardLed(l.x, l.y, l.color, pxsim.pinByName(l.label), l.w || 9, l.h || 8);
                            this.onBoardLeds.push(bl);
                            el.appendChild(bl.element);
                        }
                    }
                }
                this.onBoardNeopixels.sort((l, r) => {
                    const li = parseInt(l.name.replace(/^[^\d]*/, '')) || 0;
                    const ri = parseInt(r.name.replace(/^[^\d]*/, '')) || 0;
                    return li < ri ? -1 : li > ri ? 1 : 0;
                });
                // reset button
                if (props.visualDef.reset) {
                    this.onBoardReset = new BoardResetButton(props.visualDef.reset);
                    el.appendChild(this.onBoardReset.element);
                }
                // touch pads
                for (const l of props.visualDef.touchPads || []) {
                    const pin = pxsim.pinIds[l.label];
                    if (!pin) {
                        console.error(`touch pin ${pin} not found`);
                        continue;
                    }
                    const tp = new BoardTouchButton(l, pin);
                    this.onBoardTouchPads.push(tp);
                    el.appendChild(tp.element);
                }
                // regular buttons
                for (const l of props.visualDef.buttons || []) {
                    const tp = new BoardButton(l);
                    this.onBoardButtons.push(tp);
                    el.appendChild(tp.element);
                }
                if (props && props.theme)
                    this.updateTheme();
                if (props && props.runtime) {
                    this.board = this.props.runtime.board;
                    this.board.updateSubscribers.push(() => this.updateState());
                    this.updateState();
                }
            }
            updateTheme() {
            }
            updateState() {
                this.onBoardLeds.forEach(l => l.updateState());
                if (this.board.neopixelPin) {
                    const state = this.board.neopixelState(this.board.neopixelPin.id);
                    if (state.buffer) {
                        for (let i = 0; i < this.onBoardNeopixels.length; ++i) {
                            const rgb = state.pixelColor(i);
                            if (rgb !== null)
                                this.onBoardNeopixels[i].setColor(rgb);
                        }
                    }
                }
            }
            addDefs(el) {
                const defs = svg.child(el, "defs", {});
                let neopixelglow = svg.child(defs, "filter", { id: "neopixelglow", x: "-200%", y: "-200%", width: "400%", height: "400%" });
                svg.child(neopixelglow, "feGaussianBlur", { stdDeviation: "4.3", result: "coloredBlur" });
                let neopixelmerge = svg.child(neopixelglow, "feMerge", {});
                svg.child(neopixelmerge, "feMergeNode", { in: "coloredBlur" });
                svg.child(neopixelmerge, "feMergeNode", { in: "SourceGraphic" });
                const style = svg.child(el, "style", {});
                style.textContent = STYLE;
            }
        }
        visuals.MetroBoardSvg = MetroBoardSvg;
        class BoardResetButton {
            constructor(p) {
                p.w = p.w || 15;
                p.h = p.h || 15;
                this.element = svg.elt("circle", {
                    cx: p.x + p.w / 2,
                    cy: p.y + p.h / 2,
                    r: Math.max(p.w, p.h) / 2,
                    class: "sim-board-button"
                });
                svg.title(this.element, "RESET");
                // hooking up events
                pxsim.pointerEvents.down.forEach(evid => this.element.addEventListener(evid, ev => {
                    pxsim.U.addClass(this.element, "pressed");
                    pxsim.Runtime.postMessage({
                        type: "simulator",
                        command: "restart"
                    });
                }));
                this.element.addEventListener(pxsim.pointerEvents.leave, ev => {
                    pxsim.U.removeClass(this.element, "pressed");
                });
                this.element.addEventListener(pxsim.pointerEvents.up, ev => {
                    pxsim.U.removeClass(this.element, "pressed");
                });
            }
        }
        class BoardLed {
            constructor(x, y, colorOn, pin, w, h) {
                this.colorOn = colorOn;
                this.pin = pin;
                this.colorOff = "#aaa";
                this.backElement = svg.elt("rect", { x, y, width: w, height: h, fill: this.colorOff });
                this.ledElement = svg.elt("rect", { x, y, width: w, height: h, fill: this.colorOn, opacity: 0 });
                svg.filter(this.ledElement, `url(#neopixelglow)`);
                this.element = svg.elt("g", { class: "sim-led" });
                this.element.appendChild(this.backElement);
                this.element.appendChild(this.ledElement);
            }
            updateTheme(colorOff, colorOn) {
                if (colorOff) {
                    this.colorOff = colorOff;
                }
                if (colorOn) {
                    this.colorOn = colorOn;
                }
            }
            updateState() {
                const opacity = this.pin.mode & pxsim.PinFlags.Digital ? (this.pin.value > 0 ? 1 : 0)
                    : 0.1 + Math.max(0, Math.min(1023, this.pin.value)) / 1023 * 0.8;
                this.ledElement.setAttribute("opacity", opacity.toString());
            }
        }
        class BoardNeopixel {
            constructor(name, x, y, r) {
                this.name = name;
                this.element = svg.elt("circle", { cx: x + r / 2, cy: y + r / 2, r: 10 });
                svg.title(this.element, name);
            }
            setColor(rgb) {
                const hsl = visuals.rgbToHsl(rgb);
                let [h, s, l] = hsl;
                const lx = Math.max(l * 1.3, 85);
                // at least 10% luminosity
                l = l * 90 / 100 + 10;
                this.element.style.stroke = `hsl(${h}, ${s}%, ${Math.min(l * 3, 75)}%)`;
                this.element.style.strokeWidth = "1.5";
                svg.fill(this.element, `hsl(${h}, ${s}%, ${lx}%)`);
                svg.filter(this.element, `url(#neopixelglow)`);
            }
        }
        class BoardButton {
            constructor(def) {
                this.def = def;
                def.w = def.w || 15;
                def.h = def.h || 15;
                this.element = svg.elt("circle", {
                    cx: def.x + def.w / 2,
                    cy: def.y + def.h / 2,
                    r: Math.max(def.w, def.h) / 2,
                    class: "sim-board-button"
                });
                svg.title(this.element, def.label);
                // resolve button
                this.button = def.index !== undefined
                    ? pxsim.pxtcore.getButton(def.index)
                    : pxsim.pxtcore.getButtonByPin(pxsim.pinIds[def.label]);
                // hooking up events
                pxsim.pointerEvents.down.forEach(evid => this.element.addEventListener(evid, ev => {
                    this.button.setPressed(true);
                    pxsim.U.addClass(this.element, "pressed");
                }));
                this.element.addEventListener(pxsim.pointerEvents.leave, ev => {
                    pxsim.U.removeClass(this.element, "pressed");
                    this.button.setPressed(false);
                });
                this.element.addEventListener(pxsim.pointerEvents.up, ev => {
                    pxsim.U.removeClass(this.element, "pressed");
                    this.button.setPressed(false);
                });
            }
        }
        class BoardTouchButton {
            constructor(def, pinId) {
                this.def = def;
                def.w = def.w || 15;
                def.h = def.h || 15;
                this.element = svg.elt("circle", {
                    cx: def.x + def.w / 2,
                    cy: def.y + def.h / 2,
                    r: Math.max(def.w, def.h) / 2,
                    class: "sim-board-button"
                });
                svg.title(this.element, def.label);
                // resolve button
                this.button = pxsim.pxtcore.getTouchButton(pinId);
                // hooking up events
                pxsim.pointerEvents.down.forEach(evid => this.element.addEventListener(evid, ev => {
                    this.button.setPressed(true);
                    pxsim.U.addClass(this.element, "pressed");
                }));
                this.element.addEventListener(pxsim.pointerEvents.leave, ev => {
                    pxsim.U.removeClass(this.element, "pressed");
                    this.button.setPressed(false);
                });
                this.element.addEventListener(pxsim.pointerEvents.up, ev => {
                    pxsim.U.removeClass(this.element, "pressed");
                    this.button.setPressed(false);
                });
            }
        }
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        visuals.mkBoardView = (opts) => {
            return new visuals.MetroBoardSvg({
                runtime: pxsim.runtime,
                theme: visuals.randomTheme(),
                visualDef: opts.visual,
                boardDef: opts.boardDef,
                disableTilt: false,
                wireframe: opts.wireframe
            });
        };
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
/// <reference path="../../node_modules/pxt-core/built/pxtsim.d.ts"/>
/// <reference path="../../libs/core/dal.d.ts"/>
var pxsim;
(function (pxsim) {
    var visuals;
    (function (visuals) {
        class ButtonView {
            constructor() {
                this.style = visuals.BUTTON_PAIR_STYLE;
            }
            init(bus, state, svgEl, otherParams) {
                this.state = state;
                this.bus = bus;
                this.defs = [];
                this.element = this.mkBtn();
                let pinStr = pxsim.readPin(otherParams["button"]);
                this.pinId = pxsim.pinIds[pinStr];
                this.button = new pxsim.CommonButton(this.pinId);
                this.state.buttonsByPin[this.pinId] = this.button;
                this.updateState();
                this.attachEvents();
            }
            moveToCoord(xy) {
                let btnWidth = visuals.PIN_DIST * 3;
                let [x, y] = xy;
                visuals.translateEl(this.btn, [x, y]);
            }
            updateState() {
            }
            updateTheme() { }
            mkBtn() {
                this.btn = visuals.mkBtnSvg([0, 0]).el;
                const mkVirtualBtn = () => {
                    const numPins = 2;
                    const w = visuals.PIN_DIST * 2.8;
                    const offset = (w - (numPins * visuals.PIN_DIST)) / 2;
                    const corner = visuals.PIN_DIST / 2;
                    const cx = 0 - offset + w / 2;
                    const cy = cx;
                    const txtSize = visuals.PIN_DIST * 1.3;
                    const x = -offset;
                    const y = -offset;
                    const txtXOff = visuals.PIN_DIST / 7;
                    const txtYOff = visuals.PIN_DIST / 10;
                    let btng = pxsim.svg.elt("g");
                    let btn = pxsim.svg.child(btng, "rect", { class: "sim-button-virtual", x: x, y: y, rx: corner, ry: corner, width: w, height: w });
                    let btnTxt = visuals.mkTxt(cx + txtXOff, cy + txtYOff, txtSize, 0, "A+B");
                    pxsim.U.addClass(btnTxt, "sim-text");
                    pxsim.U.addClass(btnTxt, "sim-text-virtual");
                    btng.appendChild(btnTxt);
                    return btng;
                };
                let el = pxsim.svg.elt("g");
                pxsim.U.addClass(el, "sim-buttonpair");
                el.appendChild(this.btn);
                return el;
            }
            attachEvents() {
                let btnSvgs = [this.btn];
                btnSvgs.forEach((btn, index) => {
                    pxsim.pointerEvents.down.forEach(evid => btn.addEventListener(evid, ev => {
                        this.button.setPressed(true);
                    }));
                    btn.addEventListener(pxsim.pointerEvents.leave, ev => {
                        this.button.setPressed(false);
                    });
                    btn.addEventListener(pxsim.pointerEvents.up, ev => {
                        this.button.setPressed(false);
                    });
                });
            }
        }
        visuals.ButtonView = ButtonView;
    })(visuals = pxsim.visuals || (pxsim.visuals = {}));
})(pxsim || (pxsim = {}));
