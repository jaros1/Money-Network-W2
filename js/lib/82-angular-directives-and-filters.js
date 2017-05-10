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

;

