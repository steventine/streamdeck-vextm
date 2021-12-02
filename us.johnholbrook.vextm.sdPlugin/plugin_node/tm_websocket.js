/**
 * @file tm_websocket.js
 * @author John Holbrook
 * Provides a class to interact with VEX TM via websockets.
 */

const FormData = require("form-data");
const { promisify } = require("util");
const WebSocket = require("ws");

/**
 * @class VexTMWebsocket
 * @classdesc Provides a class to interact with VEX TM via websockets.
 */
module.exports = class VexTMWebsocket{
    /**
     * VexTMWebsocket constructor.
     * @param {String} address – TM server address
     * @param {String} password – TM admin password
     * @param {Function} log – function to send log data to
     */
    constructor(address, password, log=console.log){
        this.address = address; // address of the TM server
        this.password = password; // TM admin password
        this.log = log; // function to send log data to

        this.socket = null; // websocket object used to talk to the TM server

        this.cookie = null; // session cookie returned by the TM server
        this.cookie_expiration = null; // expiration time of the session cookie

        this.currentFieldId = null; // ID of the current field
        this.matchRunning = false; // whether a match is currently running

        this.currentMatch = null; // name of the match currently queued or running
        this.currentState = null; // state of the current match (AUTO, DRIVER, DISABLED, or TIMEOUT)
        this.currentMatchTime = 0; // time (in seconds) remaining in the current match

        this.onMatchInfoChangeCallback = null; // function to call when the current match info (match number, state, or time) changes
        this.onCloseCallback = null; // function to call when the connection to TM is closed
    }

    /**
     * Set the address and password
     * @param {String} address 
     * @param {String} password 
     */
    setCredentials(address, password){
        this.address = address;
        this.password = password;
    }

    /**
     * Authenticate with the TM server.
     */
    async _authenticate(){
        // send form data to server
        let form = new FormData();
        form.append("user", "admin");
        form.append("password", this.password)
        form.append("submit", "");
        let submitForm = promisify((addr, callback) => form.submit(addr, callback));
        let cookie_text = (await submitForm(`http://${this.address}/admin/login`)).headers['set-cookie'][0];
        
        // extract the session cookie
        let cookie_data = cookie_text.split(';')[0].split('"')[1];
        this.cookie = `user="${cookie_data}"`;

        // extract the expiration time
        let cookie_expiration = cookie_text.split(';')[1].split('=')[1];
        let expiration_date = new Date(cookie_expiration);
        this.cookie_expiration = expiration_date;
    }

    /**
     * Establish a websocket connection to the TM server
     * @param {Boolean} force - force-reinitialize the connection (default: false)
     */
    async _connectWebsocket(force=false){
        // if the cookie is missing or expired, authenticate
        if(!this.cookie || this.cookie_expiration < new Date()){
            await this._authenticate();
            // now delete the websocket so we will have to recreate it
            this.websocket = null;
        }

        if (force){
            this.websocket = null;
        }

        // if the websocket is already open, do nothing
        if (this.websocket){
            return;
        }

        this.websocket = new WebSocket(`ws://${this.address}/fieldsets/1`, {
            headers: {
                Cookie: this.cookie
            }
        });


        this.websocket.on('open', () => {
            this.log("Websocket connected to TM");
        });
        this.websocket.on('close', () => {
            this.log("Websocket disconnected from TM");
            this.onCloseCallback();
        });

        this.websocket.on('message', async event => {
            let data = JSON.parse(event.toString());
            this.log(event.toString());
            this._messageHandler(data);
        });
    }

    /**
     * Process a message from the TM server
     * @param {Object} message – the message to handle
     */
    async _messageHandler(message){
        if (message.type == "fieldMatchAssigned"){ // match queued
            // update the current field ID
            this.currentFieldId = message.fieldId ? message.fieldId : this.currentFieldId; // if the new field ID is null, don't accept it
            this.log(`Field ID updated to ${this.currentFieldId}`);

            // update the match name
            this.currentMatch = message.name;
            this._whenMatchInfoChanged();
        }
        else if (message.type == "matchStarted"){// match started
            this.matchRunning = true;
            this.currentFieldId = message.fieldId;
            this._whenMatchInfoChanged();
        }
        else if (message.type == "matchStopped" || message.type == "matchAborted"){// match stopped
            this.matchRunning = false;
            this.currentFieldId = message.fieldId;
            this.currentState = "DSBL";
            this._whenMatchInfoChanged();
        }
        else if (message.type == "matchPaused"){ // match paused
            this.matchRunning = false;
            this.currentFieldId = message.fieldId;

            this.currentState = "PAUSED";
            this._whenMatchInfoChanged();
        }
        else if (message.type == "timeUpdated"){// time remaining in current match updated
            this.currentState = message.state == "DISABLED" ? "DSBL" : message.state; // "DISABLED" is long compared to the other states
            this.currentMatchTime = message.remaining;
            this._whenMatchInfoChanged();
        }
    }

    /**
     * Connect to the websocket
     */
    async init(){
        this.log("Initializing connection to TM server...");
        await this._connectWebsocket(true);
    }

    /**
     * Send a message to the TM server
     * @param {Object} data - data to send
     */
    async _send(data){
        await this._connectWebsocket();
        this.websocket.send(JSON.stringify(data));
    }

    /**
     * Start the currently-queued match
     */
    async start(){
        await this._send({
            "action": "start",
            "fieldId": this.currentFieldId
        });
    }

    /**
     * End the match early
     */
    async endEarly(){
        await this._send({
            "action": "endEarly",
            "fieldId": this.currentFieldId
        });
    }

    /**
     * Start the currently-queued match, or end early if a match is running
     */
    async startOrEnd(){
        if (this.matchRunning){
            await this.endEarly();
        }
        else{
            await this.start();
        }
    }

    /**
     * Queue the next match
     */
    async queueNextMatch(){
        await this._send({
            "action": "queueNextMatch"
        });
    }

    /**
     * Queue the previous match
     */
    async queuePrevMatch(){
        await this._send({
            "action": "queuePrevMatch"
        });
    }

    /**
     * Queue driving skills
     * @param {Int} fieldId – ID of the field to queue the skills match on
     */
    async queueDrivingSkills(fieldId){
        await this._send({
            "action": "queueDriving"
        });
        this.currentFieldId = fieldId;
    }

    /**
     * Queue programming skills
     * @param {Int} fieldId – ID of the field to queue the skills match on
     */
    async queueProgrammingSkills(fieldId){
        await this._send({
            "action": "queueProgramming"
        });
        this.currentFieldId = fieldId;
    }

    /**
     * Reset match timer
     */
    async resetTimer(){
        await this._send({
            "action": "reset",
            "fieldId": this.currentFieldId
        });
    }

    async selectDisplay(d){
        await this._send({
            "action": "setScreen",
            "screen": parseInt(d)
        });
    }

    /**
     * Specify a function to be called any time the match info (number, state, or time remaining) changes.
     * @param {Function} callback – callback to execute
     */
    onMatchInfoChange(callback){
        this.onMatchInfoChangeCallback = callback;
    }

    /**
     * Helper function to call the onMatchInfoChange callback
     */
    _whenMatchInfoChanged(){
        this.onMatchInfoChangeCallback({
            "match": this.currentMatch,
            "state": this.currentState,
            "time" : this.currentMatchTime,
            "isRunning": this.matchRunning
        });
    }

    /**
     * Specify a function to be called when the connection to TM ends.
     * @param {Function} callback 
     */
    onClose(callback){
        this.onCloseCallback = callback;
    }
}