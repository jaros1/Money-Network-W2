angular.module('MoneyNetworkW2')

    // AddHubsCtrl. Used in addHubs template. add/remove user and wallet data hubs to/from MoneyNetwork merger site

    .controller('AddHubsCtrl', ['$scope', 'safeApply', 'MoneyNetworkW2Service', function ($scope, safeApply,  moneyNetworkW2Service) {

        var self = this;
        var controller = 'AddHubsCtrl';
        console.log(controller + ' loaded');

        function hub_text (hub_info) {
            var text ;
            text = hub_info.title ? hub_info.title : 'n/a' ;
            if (hub_info.hasOwnProperty('no_users')) text += ' - ' + hub_info.no_users + ' users' ;
            if (hub_info.hasOwnProperty('peers')) text += ' - ' + hub_info.peers + ' peers' ;
            text += ' (' + hub_info.hub + ')' ;
            return text ;
        } // hub_text

        // get a list of all user and wallet data hubs. For add hub site(s) UI
        self.all_hubs = MoneyNetworkAPILib.get_all_hubs(false, function (all_hubs) {
            var pgm = controller + ' get_all_hubs callback: ';
            var i ;
            console.log(controller + ': self.all_hubs.length = ' + self.all_hubs.length);
            // show change user profile input text
            for (i=0 ; i<all_hubs.length ; i++) {
                if ((all_hubs[i].hub_type == 'wallet') && (all_hubs[i].hub_added) && all_hubs[i].hub_title && all_hubs[i].hub_title.match(/^w2 /i)) {
                    self.wallet_data_hubs.push({hub: all_hubs[i].hub, text: hub_text(all_hubs[i])}) ;
                }
            }
            moneyNetworkW2Service.get_my_wallet_hub(function(my_wallet_hub, other_wallet_hub, other_wallet_hub_title) {
                var i ;
                for (i=0 ; i<all_hubs.length ; i++) {
                    if (all_hubs[i].hub == my_wallet_hub) {
                        self.my_wallet_data_hub = hub_text(all_hubs[i]) ;
                        all_hubs[i].disabled = true ;
                    }
                }
                self.old_wallet_data_hub = self.my_wallet_data_hub ;
                self.show_my_wallet_data_hub = true ;
                console.log(pgm + 'self.wallet_data_hubs = ' + JSON.stringify(self.wallet_data_hubs)) ;
                console.log(pgm + 'self.show_my_wallet_data_hub = ' + JSON.stringify(self.show_my_wallet_data_hub)) ;
                console.log(pgm + 'self.my_wallet_data_hub = ' + JSON.stringify(self.my_wallet_data_hub)) ;
                safeApply($scope);

            }); // get_my_wallet_hub callback 2
        }); // get_all_hubs callback 1

        self.filter_hubs = function(hub_info) {
            var pgm = controller + ' filter_hubs: ';
            // console.log(pgm + 'hub_info = ' + JSON.stringify(hub_info)) ;
            if (hub_info.hub_type == 'user') return false ;
            if (!hub_info.hub_title) return true ;
            return hub_info.hub_title.match(/w2 /i) ;
        } ; // filter_hubs

        // add/remove data hubs.
        self.add_remove_hub = function (hub_row) {
            var pgm = controller + '.add_remove_hub: ';
            if (hub_row.hub_added) {
                MoneyNetworkAPILib.z_merger_site_add(hub_row.hub, function (res) {
                    // ZeroFrame.cmd("mergerSiteAdd", [hub_row.hub], function (res) {
                    console.log(pgm + 'mergerSiteAdd. res = ', JSON.stringify(res));
                    if (res == 'ok') hub_row.hub_added = true;
                });
            }
            else {
                ZeroFrame.cmd("mergerSiteDelete", [hub_row.hub], function (res) {
                    console.log(pgm + 'mergerSiteDelete. res = ', JSON.stringify(res));
                    if (res == 'ok') hub_row.hub_added = false;
                });
            }
        };
        self.open_hub_url = function (hub_row) {
            var pgm = controller + '.open_hub_url: ';
            moneyNetworkW2Service.open_window(pgm, hub_row.url);
        };

        // download and help distribute all files? (user data hubs). used for public chat
        self.help = moneyNetworkW2Service.get_help() ;
        self.help_changed = function() {
            var pgm = controller + '.help_changed: ';
            console.log(pgm + 'self.help.bol = ' + self.help.bol) ;
            moneyNetworkW2Service.set_help(self.help.bol) ;
        } ;

        // change user profile hub. only for logged in users
        self.show_my_wallet_data_hub = false ;
        self.my_wallet_data_hub = null ;
        self.old_wallet_data_hub = null ;
        self.wallet_data_hubs = [] ;
        self.my_wallet_data_hub_changed = function() {
            var pgm = controller + '.my_wallet_data_hub_changed: ' ;
            var msg ;
            if (self.my_wallet_data_hub == self.old_wallet_data_hub) return ;
            console.log(pgm + 'self.my_wallet_data_hub = ' + self.my_wallet_data_hub) ;
            msg = [
                'Moving user profile',
                'from ' + self.old_wallet_data_hub,
                'to ' + self.my_wallet_data_hub,
                'You may want to create a export/backup before continuing',
                'Any MN-wallet sessions must be reconnected after move',
                'Any ongoing money transactions must be restarted after move',
                'Move user profile'] ;
            ZeroFrame.cmd("wrapperConfirm", [msg.join('<br>'), 'OK'], function (confirm) {
                var pgm = controller + '.my_wallet_data_hub_changed wrapperConfirm callback 1: ' ;
                var new_user_hub, pos1, pos2, msg ;
                console.log(pgm + 'confirm = ' + confirm) ;
                if (!confirm) {
                    self.my_wallet_data_hub = self.old_wallet_data_hub ;
                    return ;
                }
                moneyNetworkW2Service.z_wrapper_notification(['info', 'Moving user profile<br>Please wait for receipt<br>Publish operations can take some time', 20000]) ;
                // confirmed. move user profile to new user data hub
                pos1 = self.my_wallet_data_hub.lastIndexOf('(') ;
                pos2 = self.my_wallet_data_hub.lastIndexOf(')') ;
                new_user_hub = self.my_wallet_data_hub.substr(pos1+1,pos2-pos1-1) ;
                console.log(pgm + 'new_user_hub = ' + JSON.stringify(new_user_hub)) ;
                moneyNetworkW2Service.move_user_profile(new_user_hub, function (res) {
                    var pgm = controller + '.my_wallet_data_hub_changed move_user_profile callback 2: ' ;
                    console.log(pgm + 'move_user_hub. res = ' + JSON.stringify(res)) ;
                    // note. ignore publish error. profile was moved but publish failed
                    if ((res == 'ok') || res.error.match(/publish failed/i)) {
                        msg = [
                            'User profile was moved',
                            'Any old MN-wallet sessions must be reconnected'
                        ] ;
                        moneyNetworkW2Service.z_wrapper_notification(['done', msg.join('<br>')]) ;
                        self.old_wallet_data_hub = self.my_wallet_data_hub ;
                    }
                    else {
                        msg = [
                            'Move user profile failed',
                            'res = ' + JSON.stringify(res) +
                            'You may want to log out + log in to cleanup files',
                            'You may want to import backup (Account page)'
                        ] ;
                        console.log(pgm + msg.join('. ')) ;
                        moneyNetworkW2Service.z_wrapper_notification(['error', msg.join('<br>')]) ;
                        self.my_wallet_data_hub = self.old_wallet_data_hub ;
                    }

                }); // move_user_hub callback 2

            }); // wrapperConfirm callback 1

        } ; // my_wallet_data_hub_changed

        // AddHubsCtrl
    }])

;
