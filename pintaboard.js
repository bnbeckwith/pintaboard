/* use strict */
var INFO =
["plugin", {name: "pintaboard",
	    version: "1.2",
            href: "http://bnbeckwith.com/",
            summary: "Pinboard bookmark storage",
            xmlns: "dactyl"},
 ["author", {email:"bnbeckwith@gmail.com"}, "Benjamin Beckwith"],
 ["license",{href:"http://opensource.org/licenses/mit-license.php"}, "MIT"],
 ["project",{name:"Pentadactyl", "min-version":"1.0"}],
 ["p", {},
  "This plugin allows for storing bookmarks through the <a href=\"http://pinboard.in/api/\">pinboard api</a>."],
 ["p", {}, 
  "This file is installed in ~/pentadactyl/plugins.",
  "The user (likely, you) would then setup the password and username in your top-level customizations file."],
 ["item", {},
  ["tags", {}, "'pintaboardURL'"],
  ["spec", {}, "'pintaboardURL'"],
  ["type", {}, "string"],
  ["default", {}, "api.pinboard.in"],
  ["description", {},
   ["p", {}, 
    "This is the URL to use for the base of the Delicious API calls. Pinboard uses Version 1 of the API."]]],
 ["item", {},
  ["tags", {}, "'pintaboardToken'"],
  ["spec",{}, "'pintaboardToken'"],
  ["type", {}, "string"],
  ["default", {}, ""],
  ["description", {},
   ["p", {},
    "This is the API token found on your <a href=\"https://pinboard.in/settings/password\">pinboard settings/password</a> page."]]],
 ["item", {}, 
  ["tags", {}, "'pintaboardKey'"],
  ["spec", {}, "'pintaboardKey'"],
  ["type", {}, "string"],
  ["default", {}, "'a'"],
  ["description", {},
   ["p", {},
    "This is the key to use for launching :pinbookmark. Note that the default will override the built-in bookmark shortcut."]]]];

let pintags = null;
let pinsuggestcache = [];
let pinurladd     = "/v1/posts/add";
let pinurltags    = "/v1/tags/get";
let pinurlsuggest = "/v1/posts/suggest";
let pinurlget     = "/v1/posts/get";

group.options.add(["pintaboardURL"],
	    "Base url for Pintaboard",
	    "string","api.pinboard.in");
group.options.add(["pintaboardToken"],
	    "Token for pintaboard",
	    "string", '');
group.options.add(["pintaboardKey"],
		  "Key for storing a pinboard link",
		  "string", "a")
		  
function pinHttpsGet(path, opts, callback){
    opts.push( "auth_token=" + options['pintaboardToken']);
    if(options['pintaboardToken'] == ''){
	util.dactyl.log("Error: pintaboardToken not set", 1);
	return null;
    }
    let req = 'https://' + options['pintaboardURL'] + path + "?" + opts.join('&');
     try {
	let xmlhttp = services.Xmlhttp();
	if (callback)
	    xmlhttp.onreadystatechange = function () {
		if (xmlhttp.readyState == 4)
		    callback(xmlhttp);
	    }
	xmlhttp.open("GET", req, !!callback);
	xmlhttp.send(null);
	return xmlhttp;
    }
    catch(e) {
	util.dactyl.log("Error opening " +
			String.quote(req) + ": "
			+ e, 1);
	return null
    }
}

function pinTagData(xmlhttp){
    let elements = xmlhttp.responseXML.getElementsByTagName("tag");
    pintags = []; // Setup a list.
    for(var i=0; i < elements.length; i++) {
	var o = { tag:   elements[i].getAttribute("tag"),
		  count: elements[i].getAttribute("count") };
	pintags.push(o);
    }
}

function pinSuggestTagData(ctx, url){
    // Here I need to cache the url and suggestions for a period of
    // time This is really just so that when I type and get
    // suggestions, I am not hammering the pinboard api.
    if(pinsuggestcache[url]==undefined){
	pinHttpsGet(pinurlsuggest,
		    ["url=" + encodeURIComponent(url)],
		    function(xmlhttp){
			let elms = xmlhttp.responseXML.getElementsByTagName("recommended");
			let tags = [];
			for (var i=0; i< elms.length; i++){
			    var o = {tag: elms[i].firstChild.nodeValue };
			    tags.push(o);
			}
			pinsuggestcache[url]=tags;
			// UI is better if I set the completions explicitly here.
			ctx.completions=tags;
		    });
    }else{
	ctx.completions=pinsuggestcache[url];
    }
}
    
function pinUpdateTags(){
    pinHttpsGet(pinurltags,[],pinTagData);
}

function pinStoredTagData(ctx){
    if(pintags==null){
	pinUpdateTags();
	ctx.completions = pintags;
    }else{
	ctx.completions = pintags;
    }
}


function pinCompleteBookmark(context, args){
    if(!args.bang){
	context.title = ["Page URL"];
	let frames = buffer.allFrames();
	context.completions = [
	    [win.document.documentURI, frames.length == 1 ? "Current Location" : "Frame: " + win.document.title]
	    for ([, win] in Iterator(frames))];
	return;
    }
}

function pinAddBookmark(args) {
    let opts = {
	desc: args["-desc"] || "",
	tags: args["-tags"] || [],
	title: args["-title"] || (args.length === 0 ? buffer.title : null),
	url: args.length === 0 ? buffer.URL: args[0]
    };
    let urlopts = ["url=" + encodeURIComponent(opts['url']),
		   "description=" + encodeURIComponent(opts['title']),
		   "tags=" + encodeURIComponent(opts['tags'].join(" ")),
		   "extended=" + encodeURIComponent(opts['desc'])];

    pinHttpsGet(pinurladd,
		urlopts,
		function (xmlhttp) {
		    dactyl.echomsg(
			{ domains: [util.getHost(opts.url)], 
			  message: "Added bookmark: " + opts.url
			}, 1, commandline.FORCE_SINGLELINE);
		    pinUpdateTags(); });
}

function pinSuggestTags(url){

    return function (ctx, args){
	ctx.message = "Suggested Tags";
	ctx.title = ["Suggested Tags"];
	ctx.keys = { text: "tag", description: "tag" };
	pinSuggestTagData(ctx,url);
	return;}
}

function pinStoredTags(ctx, args){
    ctx.message     = "Stored Tags";
    ctx.title       = ["Stored Tags", "Count"];
    ctx.keys        = { text: "tag", description: "count" };
    pinStoredTagData(ctx);
    return;    
}

function pinCompleteTags(ctx, args){
    ctx.fork("suggested",0,null,pinSuggestTags(args));
    ctx.fork("stored",0,null,pinStoredTags);
    return;
}


function initPintaboard() {

    const pintagarg = {
	names: ["-tags", "-T"],
	description: "A comma-separated list of tags",
	completer: pinCompleteTags, 
	type: CommandOption.LIST
    };
    
    const pintitlearg = {
	names: ["-title","-t"],
	description: "Bookmark page title",
	completer: function description(context, args){
	    let frames = buffer.allFrames();
	    return [
		[win.document.title, frames.length ==1 ? "Current Location" : "Frame: " + win.location.href]
		for([, win] in Iterator(frames))];
	},
	type: CommandOption.STRING
    };

    const pindescriptionarg = {
	names: ["-desc", "-d"],
	description: "Bookmark description",
	type: CommandOption.STRING
    };

    group.commands.add(['pinbookmark','pb'],
		       "Add bookmarks to pinboard",
		       pinAddBookmark,
		       {   argCount: "?",
			   bang: true,
			   options: [pintagarg, pintitlearg, pindescriptionarg],
			   completer: pinCompleteBookmark,
			   privateData: true 
		       },
		      true);

    group.mappings.add(config.browserModes, [options['pintaboardKey']],
		       "Open a prompt to bookmark the current page with Pinboard",
		       function () {
			   let options = {};
			   
			   let url = buffer.uri.spec;
			   
			   if(buffer.title != buffer.uri.spec)
			       options["-title"] = buffer.title;
			   
			   CommandExMode().open(
			       commands.commandToString(
				   { command: "pinbookmark",
				     options: options,
				     arguments: [buffer.uri.spec] }));
		       });
}


// function pinPageLoaded(){
//     alert("Page loaded:"+buffer.uri.spec);
// }

// group.autocmd.add(["PageLoad"],"*",pinPageLoaded);


// Initialize the plugin
initPintaboard();
