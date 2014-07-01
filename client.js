"use strict";

/*****************
 *     SetUp     *
 *****************/
var localStream, localPeer, remotePeer;
var localVideo = document.getElementById("localVid");
var remoteVideo = document.getElementById("remoteVid");
var sendTextarea = document.getElementById("dataChannelSend");
var reciveTextarea = document.getElementById("dataChannelRevcive");
var sendButton = document.getElementById("sendButton");
var room = location.pathname.substring(1);
var servers = null;
var socket = io.connect();
var isInitiator;
var isChennelReady;
var isStarted;
var sendChannel;
var pc;
//var turnReady;

sendButton.onclick = sendData;

//ICE Servers are required to use WebRTC.
//However if computers are on same LAN,
//Then set "servers" to null.
var server_config_config = {'iceServers': [{'url': servers}]};

var pc_constraints = {
	'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true}]};

var sdpConstraints = {'mandatory': {
  'OfferToReceiveAudio':true,
  'OfferToReceiveVideo':true }};

/*****************
 *   On Connect  *
 *****************/

var room = location.pathname.substring(1);
if (room === '') {
//  room = prompt('Enter room name:');
  room = 'foo';
} else {
  //
}

if(room !== "") {
	console.log("Create or Join room" , room);
	socket.emit("create or join" , room);
}

socket.on('created', function (room){
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function (room){
  console.log('This peer has joined room ' + room);
  isChannelReady = true;
});

socket.on('log', function (array){
  console.log.apply(console, array);
});


/********************
 *  On Message Send *
 ********************/

function sendMessage(message){
	console.log("Sending Message ", message);
	socket.emit("message", message);
}

socket.on("message", function (message){
	console.log("Recived Message:", message);
	if(message === "got user media"){
		mabeStart();
	}
	else if(message.type === "offer"){
		if(!isInitiator && !isStarted){
			mabeStart();
		}
		pc.setRemoteDescription(new RTCSessionDescription(message));
		doAnswer();
	}
	else if(message.type === "answer" && isStarted){
		pc.setRemoteDescription(new RTCSessionDescription(message));
	}
	else if(message.type === "candidate" && isStarted){
		var candidate = new RTCIceCandidate({sdpMLineIndex:message.label,
		candidate:message.candidate});
		pc.addIceCandidate(candidate);
	}
	else if(message === "bye" && isStarted){
		handleRemoteHangup();
	}
});


/***********************
 * Get Video From User *
 ***********************/

/*function log(){
	var array= [">>> "];
	for(var i = 0; i < arguments.length; i++;){
		array.push(arguments[i]);
	}
	socket.emit("log", array);
}*/

function handleUserMedia (stream){
	localStream = stream;
	attachMediaStream(localVideo, stream);
	console.log("adding Local Stream.");
	sendMessage("got user media");
	if(isInitiator){
		mabeStart();
	}
}

function handleUserMediaError (error){
	console.log("getUserMedia error: ", error);
}

var constraints = {video: true};
getUserMedia(constraints, handleUserMedia, handleUserMediaError);
console.log("Getting User Media With Constraints:", constraints);

function mabeStart (){
	if(!isStarted && localStream && isChannelReady){
		createPeerConnection();
		pc.addStream(localStream);
		isStarted = true;
		if(isInitiator){
			doCall();
		}
	}
}

window.onbeforeUnload = function (e) {
	sendMessage("bye");
}


/********************************
 * Data Connection and Exchange *
 ********************************/

function createPeerConnection (){
	try{
		pc = new RTCPeerConnection(server_config, pc_constraints);
		pc.onicecadidate= handleIceCandidate;
		console.log("Created RTCPeerConnnection with:\n" +
			" config: \'" + JSON.stringify(server_config) + "\';\n" +
			" constraints: \'" + JSON.stringify(pc_constraints) + "\'.");
	}
	catch(e) {
		console.log("Failed to create PeerConnection, exception: " + e.message);
		alert("Cannot create RTCPeerConnection object.");
		return;
	}
	pc.onaddstream = handleRemoteStreamAdd;
	pc.onremovestream = handleRemoteStreamRemoved;

	if(isInitiator){
		try {
			sendChannel = pc.createDataChannel("sendDataChannel",
					{reliable: false});
			sendChannel.onmessage - handleMessage;
			trace("Created send Data Channel");
		}
		catch(e) {
			alert("Failed to create data channel. " +
					"You need Chrome m25 or later with RTPDataChannel enabled");
			trace("createDataChannel() failed with exception: " + e.message);
		}
		sendChannel.onopen = handleSendChannelStateChange;
		sendChannel.omclose = handleSendChannelStateChange;
	}
	else{
		pc.ondatachannel = gotReciveChannel;
	}
}
function sendData (){
	var data = sendTextarea.value
	sendChannel.send(data);
	trace("Sent data: " + data);
}

function gotReciveChannel (event){
	trace("Recive Channe Callback");
	sendChannel = eventChannel;
	sendChannel.onmessage = handleMessage;
	sendChannel.onopen = handleReciveChannelState;
	sendChannel.onclose = handleReciveChannelState;
}

function handleMessage (event){
	trace("Recived Message: " + event.data);
	reciveTextarea.value = event.data;
}
function handleSendChannelStateChange (){
	var readyState = sendChannel.readyState;
	trace("Send Channel State Is: " + readyState);
	enableMessagingInterface(readyState == "open");
}

function handleReciveChannelStateChange (){
	var readyState = sendChannel.readyState;
	trace("Recive Channel State Is: " + readyState);
	enableMessagingInterface(readyState == "open");
}

function enableMessageInterface (shouldEnable){
	if(shouldEnable){
		dataChannelSend.diabled = false;
		dataChannelSend.focus();
		dataChannelSend.placeholder = "";
		sendButton.disabled = false;
	}
	else {
		dataChannelSend.disabled = true;
		sendButton.disabled = true;
	}
}

function handleIceCandidate (event){
	console.log("handleiceCandidate event: " + event);
	if(event.candiddate) {
		sendMessage({
					type: "candidate",
					label: event.candidate.sdpMLineIndex,
					id: event.candidate.sdpMid,
					candidate: event.candidate.candidate});
	}
	else {
		console.log("End of candidates.");
	}
}

function doCall (){
	var constraints = {"optional": [], "mandatory": {"MozDontOfferDataChannel": true}};
	if(webrtcDetectBrowser === "chrome"){
		for(var prop in constraints.mandatory){
			if(prop.indexOf("Moz") !== -1){
				delete constraints.mandatory[prop];
			}
		}
	}
	constraints = mergeConstraints(constraints, sdpConstraints);
	console.log("Sending offer to peer with constraints: \n" + " \'" + JSON.stringify(constraints) + "\'.");
	pc.createOffer(setLocalAndSendMessage, null, sdpConstraints);
}

function mergeConstraints (cons1, cons2){
	var merged = cons1;
	for(var name in cons2.mandatory){
		merged.mandatory[name] = cons2.mandatory[name];
	}
	merged.optional.concat(cons2.optional);
	return merged;
}

function handleRemoteStreamAdded (event) {
	console.log("Remote Stream Added.");
	attachMediaStream(remoteVideo, event.stream)
	remoteStream = event.stream;
}

function hangup (){
	console.log("Hanging Up");
	stop();
	isInitiator = false;
}

function stop (){
	isStarted = false;
	pc.close();
	pc = null;
}
