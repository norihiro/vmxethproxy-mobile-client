
var ro_channels = [
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

var ro_mute_channels = [
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

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

var ws = null;
var sel_bus = "-1";
var rq_queue = [];

function rq_queue_push(cmd)
{
	rq_queue.push(cmd);
}

function rq_queue_send()
{
	while (rq_queue.length > 0) {
		var e = rq_queue.shift();
		var cmd = e[0];
		var cb = e[1];
		var data = e[2];
		if (!cb(data))
			continue;
		console.log("sending " + cmd);
		ws.send(cmd);
		// setTimeout(rq_queue_send, 1000);
		break;
	}
}

function test_bus(bus)
{
	if (bus == sel_bus)
		return true;
	return false;
}

function request_channels()
{
	for (var ch = 0; ch < 32; ch += 2) {
		rq_queue_push(["RQ1 " + (0x04000010 + ch * 0x10000).toString(16) + " 1", (x) => { return true; }, 0]);
	}

	for (var ch = 0; ch < 32; ch++) {
		rq_queue_push(["RQ1 " + (0x04000014 + ch * 0x10000).toString(16) + " 1", (x) => { return true; }, 0]);
	}
	rq_queue_send();
}

function request_channels1()
{
	for (var ch = 0; ch < 32; ch++) {
		rq_queue_push(["RQ1 " + (0x04000000 + ch * 0x10000).toString(16) + " 6", (x) => { return true; }, 0]);
		rq_queue_push(["RQ1 " + (0x0400000E + ch * 0x10000).toString(16) + " 1", (x) => { return true; }, 0]);
	}
}

function request_current_bus()
{
	if (sel_bus < 0) {
		for (var ch = 0; ch < 32; ch++)
			rq_queue_push(["RQ1 " + (0x04000016 + ch * 0x10000).toString(16) + " 2", test_bus, sel_bus]);
	}
	else if (0 <= sel_bus && sel_bus < 8) {
		var addr_base = 0x04001200 + sel_bus * 8;
		for (var ch = 0; ch < 32; ch++)
			rq_queue_push(["RQ1 " + (addr_base + ch * 0x10000 + 0x02).toString(16) + " 2", test_bus, sel_bus]); // Aux level
		for (var ch = 0; ch < 32; ch++)
			rq_queue_push(["RQ1 " + (addr_base + ch * 0x10000 + 0x00).toString(16) + " 1", test_bus, sel_bus]); // Aux send switch
	}
	rq_queue_send();
}

function on_bus_change(val)
{
	console.log("on_bus_change " + val);
	if (!ws)
		return;
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

var is_linked = new Array(32);
var cache_ch_mute = new Array(32);

function got_ch_link_int(ch, val)
{
	is_linked[ch] = val;

	var ee = document.getElementsByClassName("td-ch_" + ch);
	console.log("got_ch_link_int ee.length=" + ee.length);
	for (var i = 0; i < ee.length; i++) {
		if (val) {
			ee[i].classList.remove("link-mono");
			ee[i].classList.add((ch & 1) ? "link-odd" : "link-even");
		} else {
			ee[i].classList.remove((ch & 1) ? "link-odd" : "link-even");
			ee[i].classList.add("link-mono");
		}
	}

	var e = document.getElementById("namecode_" + ch);
	e.textContent = (val && (ch & 1) == 0) ? "CH" + (ch+1) + "/" + (ch+2) : "CH" + (ch+1);
}

function got_ch_link(ch, val)
{
	console.log("got_ch_link " + ch + " " + val);
	if (val != is_linked[ch])
		got_ch_link_int(ch, val);
	if (val != is_linked[ch ^ 1])
		got_ch_link_int(ch ^ 1, val);
}

function sw_ch_mute(ch) {
	console.log("sw_ch_mute " + ch);
	if (cache_ch_mute[ch])
		cache_ch_mute[ch] = 0x00;
	else
		cache_ch_mute[ch] = 0x01;
	senddt1(0x04000014 + ch * 0x10000, [cache_ch_mute[ch]]);
	e = document.getElementById("mute_" + ch);
	if (e && cache_ch_mute[ch]) {
		e.classList.remove("mute-off");
		e.classList.add("mute-on");
	} else if (e) {
		e.classList.remove("mute-on");
		e.classList.add("mute-off");
	}
}

function got_ch_mute(ch, val) {
	console.log("got_ch_mute " + ch + " " + val);
	cache_ch_mute[ch] = !!val;
	e = document.getElementById("mute_" + ch);
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

	e = document.getElementById("fadervalue_" + ch);
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
	e = document.getElementById("fader_" + ch);
	if (e) {
		e.value = midi2fader(v0, v1);
	}
	on_ch_fader_set_label(ch, v0, v1);
}

function got_ch_name(ch, name) {
	console.log("got_ch_name " + ch + " '" + name + "'");
	e = document.getElementById("name_" + ch);
	if (e) {
		e.textContent = name;
	}
}

function got_ch_color(ch, color) {
	console.log("got_ch_color " + ch + " " + color);
	e = document.getElementById("name_" + ch);
	if (e) {
		for (var i = 0; i < 8; i++) {
			if (i != color)
				e.classList.remove("color-" + i);
		}
		e.classList.add("color-" + color);
	}
}

document.addEventListener("DOMContentLoaded", function() {

	ws = new_ws(get_appropriate_ws_url(""), "ws");
	try {
		ws.onopen = function() {
			request_channels();
			request_current_bus();
			request_channels1();
			setInterval(rq_queue_send, 1000);
		};

		ws.onmessage = function got_packet(msg) {
			console.log("got_packet data='" + msg.data + "'");
			var words = msg.data.split(' ');
			if (words[0] == "DT1") {
				var addr = parseInt(words[1], 16);
				var data0 = parseInt(words[2], 16);
				var data1 = words.length > 3 ? parseInt(words[3], 16) : 0;
				console.log("got_packet DT1 addr=0x" + addr.toString(16));
				var ch = (addr >> 16) & 0x7F;
				var chaux = (addr >> 3) & 0x0F;
				switch (addr & 0xFFE0FFFF) {
					case 0x04000000: got_ch_name(ch, String.fromCharCode(data0, data1, parseInt(words[4], 16), parseInt(words[5], 16), parseInt(words[6], 16), parseInt(words[7], 16))); break;
					case 0x0400000E: got_ch_color(ch, data0); break;
					case 0x04000010: got_ch_link(ch, data0); break;
					case 0x04000014: got_ch_mute(ch, data0); break;
					case 0x04000016: got_ch_fader(-1, ch, data0, data1); break;
				}
				switch(addr & 0xFF00FF07) {
					case 0x04001202: got_ch_fader(chaux, ch, data0, data1); break;
				}
			}
			rq_queue_send();
		};
	
		ws.onclose = function(){
			document.getElementById("message").textContent = 'Disconnected. Please reload';
		};
	} catch(exception) {
		alert("<p>Error " + exception);  
	}
	
	var tbody = document.getElementById("channel-holder");

	// mute button
	var tr = document.createElement("tr");
	for (var ch = 0; ch < 32; ch++) {
		var td = document.createElement("td");
		td.className = "mute-holder td-ch_" + ch;
		var button = document.createElement("button");
		button.className = "mute-off";
		button.id = "mute_" + ch;
		button.textContent = "Mute";
		if (ro_channels[ch] || ro_mute_channels[ch])
			button.setAttribute("disabled", true);
		td.appendChild(button);
		tr.appendChild(td);
		var func = (function(ch) { return function() { sw_ch_mute(ch); } })(ch);
		button.addEventListener("click", func);
	}
	tbody.appendChild(tr);

	// TODO: send button

	// fader
	var tr = document.createElement("tr");
	for (var ch = 0; ch < 32; ch++) {
		var td = document.createElement("td");
		td.className = "fader-holder td-ch_" + ch;
		var fader = document.createElement("input");
		fader.className = "fader";
		fader.id = "fader_" + ch;
		fader.type = "range";
		fader.min = 0;
		fader.max = 1000;
		fader.value = 0;
		if (ro_channels[ch])
			fader.setAttribute("disabled", true);
		fader.setAttribute("orient", "vertical");
		var fadervalue = document.createElement("span");
		fadervalue.id = "fadervalue_" + ch;
		fadervalue.className = "fadervalue";
		fadervalue.textContent = "x dB";
		td.appendChild(fader);
		td.appendChild(document.createElement("br"));
		td.appendChild(fadervalue);
		tr.appendChild(td);

		var func = (function(ch) { return function(ev) { on_ch_fader(ch, ev.target.value); } })(ch);
		fader.addEventListener("input", func);

	}
	tbody.appendChild(tr);

	// channel number
	var tr = document.createElement("tr");
	for (var ch = 0; ch < 32; ch++) {
		var td = document.createElement("td");
		td.className = "namecode-holder td-ch_" + ch;
		var text = document.createElement("span");
		text.className = "namecode";
		text.id = "namecode_" + ch;
		text.textContent = "CH" + (ch+1);
		td.appendChild(text);
		tr.appendChild(td);
	}
	tbody.appendChild(tr);

	// channel name
	var tr = document.createElement("tr");
	for (var ch = 0; ch < 32; ch++) {
		var td = document.createElement("td");
		td.className = "name-holder td-ch_" + ch;
		var text = document.createElement("span");
		text.className = "name";
		text.id = "name_" + ch;
		text.textContent = "CH" + (ch+1);
		td.appendChild(text);
		tr.appendChild(td);
	}
	tbody.appendChild(tr);

	document.getElementById("bus").addEventListener("change", (e) => { on_bus_change(e.target.value); });
	on_bus_change(document.getElementById("bus").value);

}, false);

addEventListener("load", function() {
	window.scrollTo(0, 0);
}, false);

