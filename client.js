"use strict";

/*****************
 *     SetUp     *
 *****************/
var localStream, remoteStream, localPeer, remotePeer;
var localVideo = document.getElementById("localVid");
var remoteVideo = document.getElementById("remoteVid");
var sendTextarea = document.getElementById("dataChannelSend");
var reciveTextarea = document.getElementById("dataChannelRevcive");
var sendButton = document.getElementById("sendButton");
var room = location.pathname.substring(1);
var servers = null;
var socket = io.connect();
var isInitiator;
var isChannelReady;
var isStarted;
var sendChannel;
var pc;
//var turnReady;

sendButton.onclick = sendData;

//ICE Servers are required to use WebRTC.
//However if computers are on same LAN,
//Then set "servers" to null.

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

var media_constraints = {video: true};
getUserMedia(media_constraints, handleUserMedia, handleUserMediaError);
console.log("Getting User Media With Constraints:", media_constraints);

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
		pc = new RTCPeerConnection(servers, pc_constraints);
		pc.onicecandidate = handleIceCandidate;
		console.log("Created RTCPeerConnnection with:\n" +
			" config: \'" + JSON.stringify(servers) + "\';\n" +
			" constraints: \'" + JSON.stringify(pc_constraints) + "\'.");
	}
	catch(e) {
		console.log("Failed to create PeerConnection, exception: " + e.message);
		alert("Cannot create RTCPeerConnection object.");
		return;
	}
	pc.onaddstream = handleRemoteStreamAdded;
	pc.onremovestream = handleRemoteStreamRemoved;

	if(isInitiator){
		try {
			sendChannel = pc.createDataChannel("sendDataChannel",
					{reliable: false});
			sendChannel.onmessage = handleMessage;
			trace("Created send Data Channel");
		}
		catch(e) {
			alert("Failed to create data channel. " +
					"You need Chrome m25 or later with RTPDataChannel enabled");
			trace("createDataChannel() failed with exception: " + e.message);
		}
		sendChannel.onopen = handleSendChannelStateChange;
		sendChannel.onclose = handleSendChannelStateChange;
	}
	else{
		pc.ondatachannel = gotReciveChannel;
	}
}
function sendData (){
	var data = sendTextarea.value;
	sendChannel.send(data);
	trace("Sent data: " + data);
}

function gotReciveChannel (event){
	trace("Recive Channe Callback");
	sendChannel = eventChannel;
	sendChannel.onmessage = handleMessage;
	sendChannel.onopen = handleReciveChannelStateChange;
	sendChannel.onclose = handleReciveChannelStateChange;
}

function handleMessage (event){
	trace("Recived Message: " + event.data);
	reciveTextarea.value = event.data;
}
function handleSendChannelStateChange (){
	var readyState = sendChannel.readyState;
	trace("Send Channel State Is: " + readyState);
	enableMessageInterface(readyState == "open");
}

function handleReciveChannelStateChange (){
	var readyState = sendChannel.readyState;
	trace("Recive Channel State Is: " + readyState);
	enableMessageInterface(readyState == "open");
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
	if(event.candidate) {
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
	if(webrtcDetectedBrowser === "chrome"){
		for(var prop in constraints.mandatory){
			if(prop.indexOf("Moz") !== -1){
				delete constraints.mandatory[prop];
			}
		}
	}
	constraints = mergeConstraints(constraints, sdpConstraints);
	console.log("Sending offer to peer with constraints: \n" + " \'" + JSON.stringify(constraints) + "\'.");
	pc.createOffer(setLocalAndSendMessage,
			function(e){
				console.log("Create Offer Error: " + e.message);
			},
			sdpConstraints);
}

function doAnswer(){
	console.log("Sending Answer to Peer");
	pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}

function setLocalAndSendMessage (sessionDescription){
	console.log("setLocalAndSendMessage Called!");
	sessionDescription.sdp = preferOpus(sessionDescription.sdp);
	pc.setLocalDescription(sessionDescription);
	sendMessage(sessionDescription);
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
	attachMediaStream(remoteVideo, event.stream);
	remoteStream = event.stream;
}

function handleRemoteStreamRemoved(){
	console.log("Remote Stream Removed. Event: ", event);
};

function hangup (){
	console.log("Hanging Up");
	stop();
	sendMessage('bye');
}

function handleRemoteHangup(){
	console.log("Session terminated.");
	stop();
	isInitiator = false;
}

function stop (){
	isStarted = false;
	pc.close();
	pc = null;
}


// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
	var sdpLines = sdp.split('\r\n');
	var mLineIndex;
	// Search for m line.
	for (var i = 0; i < sdpLines.length; i++) {
		if (sdpLines[i].search('m=audio') !== -1) {
			mLineIndex = i;
			break;
		}
	}
	if (mLineIndex === null) {
		return sdp;
	}

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}
