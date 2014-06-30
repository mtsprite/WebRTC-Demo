//checks to make sure dependencies are met
var staticNode = require("node-static");
var http = require("http");
var file = new(staticNode.Server)();

//creates a new http server with a updated header
//that is needed for socket.io to work.
var app = http.createServer(function(req, res){
	file.serve(req, res);
}).listen(2013);

var io = require("socket.io").listen(app);
//sets up the rooms and connects the user to one of them.
io.sockets.on('connection', function(socket){

	//makes it easier for debugging perposes
	function log(){
		var array = [">>> "];
		for (var i = 0; i < arguments.length; i++){
			array.push(arguments[i]);
		}
		socket.emit("log", array);
	}

	//handles the delivery of any message the local user
	//sends th the remote user
	socket.on("message", function(message){
		log("Got Message", message);
		socket.broadcast.emit("message", message);
	});

	//handles the creation of rooms
	//or the placing of a user in  a room.
	socket.on("create or join", function(room) {
		var numClients = io.sockets.client(room).length;

		log("room" + room + " has " + numClients + " client(s)");
		log("Request to create or join room", room);

		if(numClients == 0){
			socket.join(room);
			socket.emit("created", room);
		}
		else if(numClients == 1){
			io.sockets.in(room).emit("join:", room);
			socket.join(room);
			socket.emit("joined", room);
		}
		//restricts the number of connected clients per room to 2.
		else{
			socket.emit("full", room);
		}
	socket.emit("emit(): client " + socket.id + " joined room" + room);
	socket.broadcast.emit("broadcast(): client " + socket.id + " joined room " + room);
	});
});


