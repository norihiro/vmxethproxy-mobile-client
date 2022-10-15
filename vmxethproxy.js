
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
var sel_bus = "-1";

function request_current_bus()
{
	if (sel_bus < 0) {
		for (var ch = 0; ch < 31; ch++) {
			if (ch > 1) continue; // TODO: for debuggin
			ws.send("RQ1 " + (0x04000014 + ch * 0x10000).toString(16) + " 1");
			ws.send("RQ1 " + (0x04000016 + ch * 0x10000).toString(16) + " 2");
		}
	}
	else if (0 <= sel_bus && sel_bus < 8) {
		var addr_base = 0x04001200 + sel_bus * 8;
		for (var ch = 0; ch < 31; ch++) {
			if (ch > 1) continue; // TODO: for debuggin
			ws.send("RQ1 " + (addr_base + ch * 0x10000 + 0x00).toString(16) + " 1"); // Aux send switch
			ws.send("RQ1 " + (addr_base + ch * 0x10000 + 0x02).toString(16) + " 2"); // Aux level
		}
	}
}

function on_bus_change(val)
{
	console.log("on_bus_change " + val);
	sel_bus = val;
	request_current_bus();
}

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

function midi2fader(v0, v1) {
	var x = 0;
	if (v0 & 0x40)
		x = v0 * 128 + v1 - 128 * 128;
	else
		x = v0 * 128 + v1;

	if (x < -905)
		return 0;
	var r = (x+1000)*(x+1000) / 1210;
	console.log("midi2fader v0=" + v0 + " v1=" + v1 + " x=" + x + " r=" + r);
	return r;
}

function fader2midi(val) {
	var x = Math.round(Math.sqrt(val * 1210.000) - 1000);
	x += 256*256;
	return [(x / 128) & 0x7F, x & 0x7F];
}

function on_ch_fader_set_label(ch, v0, v1) {
	var x = 0;
	if (v0 & 0x40)
		x = v0 * 128 + v1 - 128 * 128;
	else
		x = v0 * 128 + v1;

	e = document.getElementById("fadervalue_" + (ch+1));
	if (x < -905)
		e.innerHTML = "-Inf";
	else
		e.innerHTML = (x / 10).toFixed(1) + " dB";
}

function on_ch_fader(ch, val) {
	console.log("on_ch_fader " + ch + " " + val);

	vv = fader2midi(val);
	var addr_base = 0x04000016;
	if (0 <= sel_bus && sel_bus < 8)
		addr_base = 0x04001202 + sel_bus * 8;
	senddt1(addr_base + ch * 0x10000, vv);
	on_ch_fader_set_label(ch, vv[0], vv[1]);
}

function got_ch_fader(bus, ch, v0, v1) {
	console.log("got_ch_fader bus=" + bus + " ch=" + ch + " " + v0 + " " + v1);
	if (bus != sel_bus)
		return;
	e = document.getElementById("fader_" + (ch+1));
	if (e) {
		e.value = midi2fader(v0, v1);
	}
	on_ch_fader_set_label(ch, v0, v1);
}

document.addEventListener("DOMContentLoaded", function() {

	ws = new_ws(get_appropriate_ws_url(""), "ws");
	try {
		ws.onopen = function() {
			request_current_bus();
		};
	
		ws.onmessage =function got_packet(msg) {
			console.log("got_packet data='" + msg.data + "'");
			var words = msg.data.split(' ');
			if (words[0] == "DT1") {
				var addr = parseInt(words[1], 16);
				var data0 = parseInt(words[2], 16);
				var data1 = words.length > 3 ? parseInt(words[3], 16) : 0;
				console.log("got_packet DT1 addr=0x" + addr.toString(16));
				switch(addr) {
					case 0x04000014: got_ch_mute(0, data0); break;
					case 0x04010014: got_ch_mute(1, data0); break;
					case 0x04000016: got_ch_fader(-1, 0, data0, data1); break;
					case 0x04001202: got_ch_fader(0, 0, data0, data1); break;
					case 0x0400120a: got_ch_fader(1, 0, data0, data1); break;
					case 0x04001212: got_ch_fader(2, 0, data0, data1); break;
					case 0x0400121a: got_ch_fader(3, 0, data0, data1); break;
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

	document.getElementById("bus").addEventListener("change", (e) => { on_bus_change(e.target.value); });

	document.getElementById("mute_1").addEventListener("click", () => { sw_ch_mute(0); });
	document.getElementById("mute_2").addEventListener("click", () => { sw_ch_mute(1); });

	document.getElementById("fader_1").addEventListener("input", (e) => { on_ch_fader(0, e.target.value); });
	document.getElementById("fader_2").addEventListener("input", (e) => { on_ch_fader(1, e.target.value); });

}, false);

addEventListener("load", function() {
	window.scrollTo(0, 0);
}, false);

