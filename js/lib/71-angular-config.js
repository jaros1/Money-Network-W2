// angularJS app
angular.module('MoneyNetworkW2', ['ngRoute', 'ngSanitize', 'ui.bootstrap', 'ngDialog']);

angular.module('MoneyNetworkW2')

    .config(['$routeProvider', function ($routeProvider) {

        var pgm = 'routeProvider: ';

        var set_z_path = ['$location', function ($location) {
            var pgm = 'routeProvider.set_z_path: ';
            var a_path, a_search, z_path, key;
            a_path = $location.path();
            a_search = $location.search();
            z_path = "?path=" + a_path;
            for (key in a_search) z_path += '&' + key + '=' + a_search[key];
            console.log(pgm + 'z_path = ' + z_path) ;
            ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Money Network W2", z_path]);
            return z_path;
        }];

        // setup routes. For now only one page wallet
        $routeProvider
            .when('/wallet', {
                templateUrl: 'wallet.html',
                controller: 'WalletCtrl as w',
                resolve: {check_auth: set_z_path}
            })
            .otherwise({
                redirectTo: function () {
                    // error or startup. redirect to wallet page
                    var pgm = 'routeProvider.otherwise: ';
                    var search, a_path, z_path, i, sessionid ;
                    search = window.location.search;
                    console.log(pgm + 'search = ', search) ;
                    // check for sessionid
                    i = search.indexOf('sessionid=');
                    if (i == -1) a_path = '/wallet'; // error or no sessionid in startup url. maybe a standalone wallet call
                    else {
                        // deep link
                        sessionid = search.substr(i + 10);
                        i = sessionid.indexOf('&');
                        if (i != -1) sessionid = sessionid.substr(0, i);
                        a_path = '/wallet?sessionid=' + sessionid ;
                    }
                    console.log(pgm + 'a_path = ' + a_path) ;
                    ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "", a_path]);
                    return a_path;
                }
            });

        // end config (ng-routes)

    }])

;


