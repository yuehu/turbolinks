/**
 * Turbolinks in component.
 */

var delegate = require('delegate');
var domparse = require('dom-parser');
var execute = require('execute-script');
var Emitter = require('emitter');

exports = module.exports = new Emitter();


var hasHistoryState = history && history.pushState && history.replaceState && (history.state !== undefined || navigator.userAgent.match(/Firefox\/2[6|7]/));
var buggyBrowsers = navigator.userAgent.match(/CriOS\//);

// TODO: cookie
var isSupported = hasHistoryState && !buggyBrowsers;

var currentState, referrer;

function visit(url) {
  if (!isSupported) return location.href = url;

  // remember referer
  referrer = location.href;

  // TODO: cache current page

  // reflect new url
  if (url !== referrer) {
    history.pushState({turbolinks: true, url: url}, '', url);
  }

  // TODO: transition cache

  fetch(url, function() {
    if (location.hash) {
      return location.href = location.href;
    } else {
      window.scrollTo(0, 0);
    }
  });
}


/**
 * Fetch and render the data.
 */
function fetch(url, cb) {
  exports.emit('page:fetch', {url: url});

  if (fetch.xhr) {
    fetch.xhr.abort();
  }

  // remove hash for IE10 compatibility
  var safeURL = removeHash(url);

  fetch.xhr = request(safeURL, function(xhr) {
    exports.emit('page:receive');
    var doc;
    var ct = xhr.getResponseHeader('Content-Type');
    if (validContentType(ct) && validStatus(xhr.status)) {
      doc = domparse(xhr.responseText);
    }
    if (!doc) {
      return location.href = url;
    }

    render(doc, true);

    // reflect redirected url
    var loc = xhr.getResponseHeader('X-XHR-Redirected-To');
    if (loc) {
      var preservedHash = removeHash(loc) === loc ? document.hash : '';
      history.replaceState(currentState, '', loc + preservedHash);
    }

    cb && cb();
    exports.emit('page:load');
  });

  fetch.xhr.onloadend = function() {
    fetch.xhr = null;
  };
}

/**
 * Render data to document.
 */
function render(doc, runscript) {
  var node = doc.querySelector('title');
  var title = node ? node.textContent : null;
  // update title
  if (title) {
    document.title = data.title;
  }

  var body = doc.body;
  // remove <noscript>
  body.innerHTML = body.innerHTML.replace(/<noscript[\S\s]*?<\/noscript>/ig, '');

  // update body
  document.documentElement.replaceChild(body, document.body);

  // update head
  updateHead(doc.head);

  if (runscript) {
    executeScripts(document.body);
  }

  currentState = history.state;
  exports.emit('page:change');
  exports.emit('page:update');
}


/**
 * Send a GET request.
 */
function request(url, cb) {
  var xhr = new XMLHttpRequest();

  xhr.open('GET', url, true);
  xhr.setRequestHeader('Accept', 'text/html, application/xhtml+xml, application/xml');
  xhr.setRequestHeader('X-XHR-Referer', referrer);

  xhr.onload = function() {
    cb && cb(xhr);
  };

  xhr.onerror = function() {
    location.href = url;
  };

  // emit progress data
  if (xhr.upload) {
    xhr.upload.onprogress = function(e){
      e.percent = e.loaded / e.total * 100;
      exports.emit('progress', e);
    };
  }

  xhr.send();
  return xhr;
}


/**
 * Remove hash on a URL.
 */
function removeHash(url) {
  var link = url;
  if (!url.href) {
    link = document.createElement('A');
    link.href = url;
  }
  return url.href.replace(url.hash, '');
}


/**
 * Validate content type of a response.
 */
function validContentType(ct) {
  return ct.match(/^(?:text\/html|application\/xhtml\+xml|application\/xml)(?:;|$)/);
}

/**
 * Validate response status code.
 */
function validStatus(code) {
  return code < 400;
}

function executeScripts(doc) {
  var scripts = doc.querySelectorAll('script:not([data-turbolinks-eval="false"])');
  for (var i = 0; i < scripts.length; i++) {
    execute(scripts[i]);
  }
}

function updateHead(head) {
  var nodes = head.querySelectorAll('meta');
  for (var i = 0; i < nodes.length; i++) {
    (function(meta) {
      if (!meta.name) return;
      var selector = 'meta[name="' + meta.name + '"]';
      var original = document.head.querySelector(selector);
      if (original) original.content = meta.content;
    })(nodes[i]);
  }
}

// initialize for event
if (document.addEventListener && document.createEvent) {
  document.addEventListener('DOMContentLoaded', function() {
    exports.emit('page:change');
    exports.emit('page:update');
  }, true);
}

// initialize for click
if (isSupported) {
  // remember current url
  history.replaceState({turbolinks: true, url: location.href}, '', location.href);
  // remember current state
  currentState = history.state;
  delegate.bind(document, 'a', 'click', handleClick, true);
}

function handleClick(e) {
  if (!e.defaultPrevented) {
    var node = e.delegateTarget;

    // ignore cross origin link
    var crossOriginLink = location.protocol !== node.protocol || location.host !== node.host;

    // ignore anchors
    var anchoredLink = (node.hash && removeHash(node)) === removeHash(location) || node.href === location.href + '#';

    var url = removeHash(node);
    var nonHtmlLink = url.match(/\.[a-z]+(\?.*)?$/g) && !url.match(/\.(?:htm|html)?(\?.*)?$/g);

    var targetLink = node.target.length !== 0;

    var nonStandardClick = e.which > 1 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

    var ignoreClick = crossOriginLink || anchoredLink || nonHtmlLink || targetLink || nonStandardClick;

    if (!ignoreClick) {
      visit(node.href);
      return e.preventDefault();
    }
  }
}

exports.isSupported = isSupported;
exports.visit = visit;
