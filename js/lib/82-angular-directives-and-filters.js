angular.module('MoneyNetworkW2')

    .filter('shortCertId', [ function () {
        // short format for unix timestamp used in chat
        return function (cert_user_id) {
            var index ;
            if (!cert_user_id) return 'select ...' ;
            index = cert_user_id.indexOf('@') ;
            if (index == -1) return cert_user_id ;
            else return cert_user_id.substr(0,index);
        } ;
        // end shortCertId
    }])

    // https://github.com/jaros1/Money-Network-W2/issues/50
    // insert <br> in text. Prevent long texts breaking responsive. for example in ZeroNet notifications
    .filter('br', [function () {
        // https://stackoverflow.com/questions/15458876/check-if-a-string-is-html-or-not
        var is_html = function isHTML(str) {
            var a = document.createElement('div');
            a.innerHTML = str;
            for (var c = a.childNodes, i = c.length; i--; ) {
                if (c[i].nodeType == 1) return true;
            }
            return false;
        } ;
        return function (text) {
            var pgm = 'br: ' ;
            var texts, lng_pixels, i, width, e, maxpct, pct, max_i, from_i, from_pct, to_i, to_pct, text1, text2 ;

            if (!text) return text ;
            if (typeof text != 'string') text = JSON.stringify(text) ;
            texts = text.split('<br>') ;
            // if (texts.length == 1) return text ;

            // actual screen width
            e = document.getElementById('ng-view-id') ;
            if (e) width = e.offsetWidth ;
            else width = window.innerWidth ;

            // create canvas for text length calc in pixel length calc
            var c2 = document.createElement("CANVAS") ;
            c2.width = 300 ;
            c2.height = 150 ;
            var ctx2 = c2.getContext("2d");
            ctx2.font = "14px Lucida Grande,Segoe UI,Helvetica,Arial,sans-serif"; // ZeroNet notification

            while (true) {
                // check text lengths in pixels
                maxpct = 0 ;
                for (i=0 ; i<texts.length ; i++) {
                    if (is_html(texts[i])) continue ; // html. skip length check.
                    lng_pixels = ctx2.measureText(texts[i]).width ;
                    pct = lng_pixels / width * 100 ;
                    if (pct > maxpct) {
                        maxpct = pct ;
                        max_i = i ;
                    }
                }
                if (maxpct < 67) return texts.join('<br>') ; // OK. notification within viewport

                // problem with texts[max_i] maxpct >= 67
                // console.log(pgm + 'screen.width = ' + width + ', lngs = ' + JSON.stringify(lngs) + ', maxpct = ' + maxpct + ', max_i = ' + max_i) ;

                // binary search for text with pct just below 67
                from_i = 0 ; from_pct = 0 ;
                to_i = texts[max_i].length ; to_pct = maxpct ;
                while (true) {
                    i = Math.round((to_i+from_i)/2) ;
                    if ((i==from_i) || (i==to_i)) break ;
                    // console.log(pgm + 'from_i = ' + from_i + ', to_i = ' + to_i + ', i = ' + i) ;
                    text1 = texts[max_i].substr(0,i) ;
                    pct = ctx2.measureText(text1).width / width * 100 ;
                    if (pct < 67) {
                        // check right side of interval
                        from_i = i ;
                        from_pct = pct ;
                    }
                    else {
                        // check left side of interval
                        to_i = i ;
                        to_pct = pct ;
                    }
                    // console.log(pgm + 'i = ' + i + ', pct = ' + pct + ', from_i = ' + from_i + ', from_pct = ' + from_pct + ', to_i = ' + to_i + ', to_pct = ' + to_pct) ;
                } // inner while loop

                // console.log(pgm + 'old texts = ' + JSON.stringify(texts)) ;
                text1 = texts[max_i].substr(0,from_i) ;
                text2 = texts[max_i].substr(from_i) ;
                texts.splice(max_i, 1, text1, text2) ;
                // console.log(pgm + 'new texts = ' + JSON.stringify(texts)) ;

            } // outer while loop

        } ;
        // end br
    }])


;

