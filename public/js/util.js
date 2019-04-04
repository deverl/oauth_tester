function Utility() {
  function set_cookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
  }

  function get_cookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(";");
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == " ") {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
  }

  function get_state() {
    let s = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      let r = (Math.random() * 16) | 0,
        v = c == "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    let d = new Date();

    let t = d.getTime();

    let state = `${t}.${s}`;

    return state;
  }

  function parse_query_string(query_string) {
    let vars = [];

    if (query_string && typeof query_string === "string") {
      let a = query_string.split("&");
      for (let i = 0; i < a.length; ++i) {
        let s = a[i];
        let pair = s.split("=");
        if (pair && Array.isArray(pair) && pair.length == 2) {
          let k = decodeURIComponent(pair[0]);
          let v = decodeURIComponent(pair[1]);
          if (k && v) {
            vars[k] = v;
          }
        }
      }
    }

    return vars;
  }

  return {
    set_cookie: set_cookie,
    get_cookie: get_cookie,
    get_state: get_state,
    parse_query_string: parse_query_string
  };
}
