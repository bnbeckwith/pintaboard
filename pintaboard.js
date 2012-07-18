/* use strict */
XML.ignoreWhitespace = false;
XML.prettyPrinting = false;
var INFO =
<plugin name="pintaboard" version="1.0"
        href="http://bnbeckwith.com/"
        summary="Pinboard bookmark storage"
        xmlns={NS}>
    <author email="bnbeckwith@gmail.com">Benjamin Beckwith</author>
    <license href="http://opensource.org/licenses/mit-license.php">MIT</license>
    <project name="Pentadactyl" minVersion="1.0"/>
    <p>
       This plugin allows for storing bookmarks through the <a href="http://pinboard.in/api/">pinboard api</a>.
    </p>
    <p>This file is installed in ~/pentadactyl/plugins. 
       The user (likely, you) would then setup the password and username in your top-level customizations file.
    </p>
    <item>
      <tags>'pintaboardURL'</tags>
      <spec>'pintaboardURL'</spec>
      <type>string</type>
      <default>api.pinboard.in</default>
      <description>
        <p>
          This is the URL to use for the base of the Delicious API calls. Pinboard uses Version 1 of the API.
        </p>
      </description>
    </item>
    <item>
      <tags>'pintaboardToken'</tags>
      <spec>'pintaboardToken'</spec>
      <type>string</type>
      <default></default>
      <description>
        <p>
          This is the API token found on your <a href="https://pinboard.in/settings/password">pinboard settings/password</a> page.
        </p>
      </description>
    </item>
    <item>
      <tags>'pintaboardKey'</tags>
      <spec>'pintaboardKey'</spec>
      <type>url</type>
      <default>'a'</default>
      <description>
        <p>
          This is the key to use for launching :pinbookmark. Note that the default will override the built-in bookmark shortcut.
        </p>
      </description>
    </item>
</plugin>;

let pintags = null;
let pinurladd  = "/v1/posts/add?";
let pinurltags = "/v1/tags/get";

group.options.add(["pintaboardURL"],
	    "Base url for Pintaboard",
	    "string","api.pinboard.in");
group.options.add(["pintaboardToken"],
	    "Token for pintaboard",
	    "string", "");
group.options.add(["pintaboardKey"],
		  "Key for storing a pinboard link",
		  "string", "a")
		  

function pinHttpGet(url, callback){
    pinSecureGet(url, callback);
}

function pinUserPasswordEncoded() {
    let s = options['pintaboardUser'] +
	":" + options['pintaboardPassword'];
    return window.btoa(s);
}

function pinSecureGet(url, callback){
    try {
	let xmlhttp = services.Xmlhttp();
	if (callback)
	    xmlhttp.onreadystatechange = function () {
		if (xmlhttp.readyState == 4)
		    callback(xmlhttp);
	    }
	xmlhttp.open("GET", url, !!callback);
	var auth = "Basic " + pinUserPasswordEncoded();
	xmlhttp.setRequestHeader("Authorization", auth);
	xmlhttp.send(null);
	return xmlhttp;
    }
    catch(e) {
	util.dactyl.log("Error opening " +
			String.quote(url) + ": "
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

function pinUpdateTags(){
    let url = "https://" + 
	options["pintaboardUser"] + ":" + options["pintaboardPassword"] + "@" +
	options["pintaboardURL"] + pinurltags;
    pinHttpGet(url,pinTagData);
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
    let url = "https://" + options["pintaboardURL"] + pinurladd;
    url += "url=" + encodeURIComponent(opts['url']);
    url += "&description=" + encodeURIComponent(opts['title']);
    url += "&tags=" + encodeURIComponent(opts['tags'].join(" "));
    url += "&extended=" + encodeURIComponent(opts['desc']);

    pinHttpGet(url, 
	       function (xmlhttp) {
		   dactyl.echomsg(
		       { domains: [util.getHost(opts.url)], 
			 message: "Added bookmark: " + opts.url
		       }, 1, commandline.FORCE_SINGLELINE);
		   pinUpdateTags(); });
}

function pinCompleteTags(ctx, args){
    ctx.message     = "Stored Tags";
    ctx.title       = ["TAG", "COUNT"];
    ctx.keys        = { text: "tag", description: "count" };
    ctx.completions = pintags;
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
			   if(pintags == null)
			       pinUpdateTags();
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
    // I don't know if there is a better way to update the tags, but I
    // just call this once at the beginning.
    pinUpdateTags();
}

// Initialize the plugin
initPintaboard();
