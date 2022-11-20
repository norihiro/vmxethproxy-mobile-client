
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
var ws_connected = false;
var sel_bus = -2;
var rq_queue = [];
var mem = [];

function rq_queue_push(cmd)
{
	rq_queue.push(cmd);
}

function rq_queue_send()
{
	if (!ws_connected)
		return;
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

	for (var aux = 0; aux < 4; aux++) {
		rq_queue_push(["RQ1 " + (0x06000000 + aux * 0x10000).toString(16) + " 6", (x) => { return true; }, 0]);
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
	sel_bus = parseInt(val);
	if (ws_connected)
		request_current_bus();

	for (var ch = 0; ch < 32; ch++)
		update_ch_send(ch, cache_ch_aux_send_get(sel_bus, ch));
}

function senddt1(addr, data)
{
	msg = "DT1 " + addr.toString(16);
	for (var i = 0; i < data.length; i++) {
		msg = msg + " " + data[i].toString(16);
		mem[addr + i] = data[i];
	}
	console.log("sending " + msg);
	ws.send(msg);
}

var is_linked = new Array(32);
var cache_ch_mute = new Array(32);
var cache_ch_aux_send = new Array(13 * 32);

function cache_ch_aux_send_set(aux, ch, val) {
	if (-1 <= aux && aux < 12 && 0 <= ch && ch < 32)
		return cache_ch_aux_send[(aux+1) * 32 + ch] = !!val;
	return true;
}
function cache_ch_aux_send_get(aux, ch) {
	if (-1 <= aux && aux < 12 && 0 <= ch && ch < 32)
		return cache_ch_aux_send[(aux+1) * 32 + ch];
	console.log("Error: cache_ch_aux_send_get aux=" + aux + " ch=" + ch);
	return true;
}

for (var a = -1; a < 12; a++) for (var c = 0; c < 32; c++) cache_ch_aux_send_set(a, c, true);

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

function update_ch_mute(ch, val)
{
	e = document.getElementById("mute_" + ch);
	if (e && val) {
		e.classList.remove("mute-off");
		e.classList.add("mute-on");
	} else if (e) {
		e.classList.remove("mute-on");
		e.classList.add("mute-off");
	}
	var fader = document.getElementById("fader_" + ch);
	if (fader && val)
		fader.classList.add("mute-on");
	else if (fader)
		fader.classList.remove("mute-on");
}

function sw_ch_mute(ch) {
	console.log("sw_ch_mute " + ch);
	if (cache_ch_mute[ch])
		cache_ch_mute[ch] = 0x00;
	else
		cache_ch_mute[ch] = 0x01;
	senddt1(0x04000014 + ch * 0x10000, [cache_ch_mute[ch]]);
	update_ch_mute(ch, cache_ch_mute[ch]);
}

function got_ch_mute(ch, val) {
	console.log("got_ch_mute " + ch + " " + val);
	cache_ch_mute[ch] = !!val;
	update_ch_mute(ch, cache_ch_mute[ch]);
}

function update_ch_send(ch, val)
{
	console.log("update_ch_send ch=" + ch + " val=" + val);
	var button = document.getElementById("send_" + ch);
	var fader = document.getElementById("fader_" + ch);
	if (button && val) {
		button.classList.remove("send-off");
		button.classList.add("send-on");
		button.textContent = "On";
		fader.classList.remove("send-off");
	} else if (button) {
		button.classList.remove("send-on");
		button.classList.add("send-off");
		button.textContent = "Off";
		fader.classList.add("send-off");
	}
}

function sw_ch_send(ch)
{
	console.log("sw_ch_send " + ch + " sel_bus=" + sel_bus);
	if (sel_bus < -1 || 12 <= sel_bus)
		return;
	var v = cache_ch_aux_send_get(sel_bus, ch);
	v = cache_ch_aux_send_set(sel_bus, ch, !v);
	var addr_base = 0x0400001C;
	if (0 <= sel_bus && sel_bus < 12)
		addr_base = 0x04001200 + sel_bus * 8;
	senddt1(addr_base + ch * 0x10000, [v ? 0x01 : 0x00]);
	update_ch_send(ch, v);
}

function got_ch_send(chaux, ch, val)
{
	console.log("got_ch_send " + ch + " " + val);
	if (sel_bus < -1 || 12 <= sel_bus)
		return;
	val = cache_ch_aux_send_set(chaux, ch, val);
	if (chaux == sel_bus)
		update_ch_send(ch, val);
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

function got_ch_name(ch) {
	var a = 0x04000000 + (ch << 16);
	var name = String.fromCharCode(mem[a], mem[a+1], mem[a+2], mem[a+3], mem[a+4], mem[a+5]);
	console.log("got_ch_name " + ch + " '" + name + "'");
	e = document.getElementById("name_" + ch);
	if (e) {
		e.textContent = name;
	}
}

function got_ch_color(ch, color)
{
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

function got_aux_name(aux)
{
	var a = 0x06000000 + (aux << 16);
	var name = String.fromCharCode(mem[a], mem[a+1], mem[a+2], mem[a+3], mem[a+4], mem[a+5]);
	console.log("got_aux_name " + aux + " '" + name + "'");
	e = document.getElementById("bus_select_" + aux);
	if (e) {
		e.innerHTML = "Aux " + (aux + 1) + " - " + name.trim();
	}
}

document.addEventListener("DOMContentLoaded", function() {

	ws = new_ws(get_appropriate_ws_url(""), "ws");
	try {
		ws.onopen = function() {
			ws_connected = true;
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
				for (var i = 0; i + 2 < words.length; i++) {
					var a = addr + i;
					mem[a] = parseInt(words[i + 2], 16);

					var ch = (a >> 16) & 0x7F;
					var chaux = (a >> 3) & 0x0F;
					switch (a & 0xFFE0FFFF) {
						case 0x04000000:
						case 0x04000001:
						case 0x04000002:
						case 0x04000003:
						case 0x04000004:
						case 0x04000005: got_ch_name(ch); break;
						case 0x0400000E: got_ch_color(ch, mem[a]); break;
						case 0x04000010: got_ch_link(ch, mem[a]); break;
						case 0x04000014: got_ch_mute(ch, mem[a]); break;
						case 0x04000017: got_ch_fader(-1, ch, mem[a-1], mem[a]); break;
						case 0x0400001C: got_ch_send(-1, ch, mem[a]); break;
						case 0x06000000:
						case 0x06000001:
						case 0x06000002:
						case 0x06000003:
						case 0x06000004:
						case 0x06000005: got_aux_name(ch); break;
					}
					switch(a & 0xFF00FF07) {
						case 0x04001200: got_ch_send(chaux, ch, mem[a]); break;
						case 0x04001203: got_ch_fader(chaux, ch, mem[a-1], mem[a]); break;
					}
				}
			}
			rq_queue_send();
		};
	
		ws.onclose = function(){
			ws_connected = false;
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

	// send button
	var tr = document.createElement("tr");
	for (var ch = 0; ch < 32; ch++) {
		var td = document.createElement("td");
		td.className = "send-holder td-ch_" + ch;
		var button = document.createElement("button");
		button.className = "send-on";
		button.id = "send_" + ch;
		button.textContent = "On";
		if (ro_channels[ch])
			button.setAttribute("disabled", true);
		td.appendChild(button);
		tr.appendChild(td);
		var func = (function(ch) { return function() { sw_ch_send(ch); } })(ch);
		button.addEventListener("click", func);
	}
	tbody.appendChild(tr);

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

