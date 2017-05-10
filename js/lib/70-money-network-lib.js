// fix missing Array.indexOf in IE8
// http://stackoverflow.com/questions/3629183/why-doesnt-indexof-work-on-an-array-ie8
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (elt /*, from*/) {
        var len = this.length >>> 0;

        var from = Number(arguments[1]) || 0;
        from = (from < 0)
            ? Math.ceil(from)
            : Math.floor(from);
        if (from < 0)
            from += len;

        for (; from < len; from++) {
            if (from in this &&
                this[from] === elt)
                return from;
        }
        return -1;
    };
}


// helper functions
var MoneyNetworkHelper = (function () {

    var module = 'MoneyNetworkHelper' ;

    var API_Key = '44bb2b39eaf2a164afe164560c725b4bf2842698' ;
    var API_Secret = 'f057354b22d9cbf9098e4c2db8e1643a3342c6fa' ;
    var api_client, bitcoin_wallet, bitcoin_wallet_backup_info ;
    function get_wallet_status () {
        return (bitcoin_wallet ? 'open' : 'n/a') ;
    }

    function init_api_client () {
        if (api_client) return ;
        api_client = blocktrail.BlocktrailSDK({
            apiKey: API_Key,
            apiSecret: API_Secret,
            network: 'BTC',
            testnet: true
        });
        return api_client ;
    }

    function generate_random_string(length, use_special_characters) {
        var character_set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        if (use_special_characters) character_set += '![]{}#%&/()=?+-:;_-.@$|£' ;
        var string = [], index, char;
        for (var i = 0; i < length; i++) {
            index = Math.floor(Math.random() * character_set.length);
            char = character_set.substr(index, 1);
            string.push(char);
        }
        return string.join('');
    } // generate_random_string

    function create_new_wallet (wallet_id, wallet_password, cb) {
        var pgm = module + '.create_new_wallet: ' ;
        if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing') ;
        init_api_client() ;
        api_client.createNewWallet(wallet_id, wallet_password, function (err, wallet, backupInfo) {
            if (!err) {
                bitcoin_wallet = wallet ;
                console.log('Wallet = ' + CircularJSON.stringify(wallet)) ;
                bitcoin_wallet_backup_info = backupInfo ;
                console.log('Backup info = ' + CircularJSON.stringify(backupInfo)) ;
            }
            cb(err) ;
        }) ;
    } // create_new_wallet

    function delete_wallet (cb) {
        if (!bitcoin_wallet) return cb('Wallet not open. Please log in first') ;
        bitcoin_wallet.deleteWallet(function (error, success) {
            if (success) {
                bitcoin_wallet = null ;
                cb(null);
            }
            else cb('Could not delete wallet. error = ' + JSON.stringify(error)) ;
        }) ;
    } // delete_wallet

    // export helpers
    return {
        init_api_client: init_api_client,
        generate_random_string: generate_random_string,
        create_new_wallet: create_new_wallet,
        delete_wallet: delete_wallet,
        get_wallet_status: get_wallet_status
    };

})();
// MoneyNetworkHelper end
