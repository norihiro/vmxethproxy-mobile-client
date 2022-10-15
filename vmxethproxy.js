
function get_appropriate_ws_url(extra_url) {
	var pcol;
	var u = document.URL;

	/*
	 * We open the websocket encrypted if this page came on an
	 * https:// url itself, otherwise unencrypted
	 */

	if (u.substring(0, 5) === "https") {
		pcol = "wss://";
		u = u.substr(8);
	} else {
		pcol = "ws://";
		if (u.substring(0, 4) === "http")
			u = u.substr(7);
	}

	u = u.split("/");

	/* + "/xxx" bit is for IE10 workaround */

	return pcol + u[0] + "/" + extra_url;
}

function new_ws(urlpath, protocol)
{
	return new WebSocket(urlpath, protocol);
}

var ws;

function senddt1(addr, data)
{
	msg = "DT1 " + addr.toString(16);
	for (var i = 0; i < data.length; i++)
		msg = msg + " " + data[i].toString(16);
	console.log("sending " + msg);
	ws.send(msg);
}

var cache_ch_mute = new Array(32);

function sw_ch_mute(ch) {
	console.log("sw_ch_mute " + ch);
	if (cache_ch_mute[ch])
		cache_ch_mute[ch] = 0x00;
	else
		cache_ch_mute[ch] = 0x01;
	senddt1(0x04000014 + ch * 0x10000, [cache_ch_mute[ch]]);
	e = document.getElementById("mute_" + (ch+1));
	if (e && cache_ch_mute[ch]) {
		e.classList.remove("mute-off");
		e.classList.add("mute-on");
	} else if (e) {
		e.classList.remove("mute-on");
		e.classList.add("mute-off");
	}
}

function got_ch_mute(ch, val) {
	console.log("sw_ch_mute " + ch + " " + val);
	cache_ch_mute[ch] = !!val;
	e = document.getElementById("mute_" + (ch+1));
	if (e && cache_ch_mute[ch]) {
		e.classList.remove("mute-off");
		e.classList.add("mute-on");
	} else if (e) {
		e.classList.remove("mute-on");
		e.classList.add("mute-off");
	}
}

document.addEventListener("DOMContentLoaded", function() {

	ws = new_ws(get_appropriate_ws_url(""), "ws");
	try {
		ws.onopen = function() {
			// document.getElementById("b").disabled = 0;
			// document.getElementById("m").disabled = 0;
		};
	
		ws.onmessage =function got_packet(msg) {
			console.log("got_packet data='" + msg.data + "'");
			var words = msg.data.split(' ');
			if (words[0] == "DT1") {
				var addr = parseInt(words[1], 16);
				var data0 = parseInt(words[2], 16);
				console.log("got_packet DT1 addr=0x" + addr.toString(16));
				switch(addr) {
					case 0x04000014: got_ch_mute(0, data0); break;
					case 0x04010014: got_ch_mute(1, data0); break;
				}
			}
		};
	
		ws.onclose = function(){
			// document.getElementById("b").disabled = 1;
			// document.getElementById("m").disabled = 1;
		};
	} catch(exception) {
		alert("<p>Error " + exception);  
	}
	
	function sendmsg()
	{
		// ws.send(document.getElementById("m").value);
		// document.getElementById("m").value = "";
	}

	document.getElementById("mute_1").addEventListener("click", () => { sw_ch_mute(0); });
	document.getElementById("mute_2").addEventListener("click", () => { sw_ch_mute(1); });

}, false);

addEventListener("load", function() {
	window.scrollTo(0, 0);
}, false);

