//
//  API for MoneyNetwork <=> MoneyNetwork wallet communication
//  Requirements:
// - JSEncrypt: https://github.com/travist/jsencrypt
// - cryptMessage: ZeroNet build-in plugin
// - CryptoJS: code.google.com/p/crypto-js
//

// todo:
// - add logout message. MN => wallets & wallet => MN
// - timeout in request = logout for other session = close session.
//   timeout can also be a "server" fault (error in other session). can be verified with a simple ping
//   timeout in simple ping = closed session. OK simple ping = server fault in previous response
// - offline transactions. cleanup request when response is received
// - add done message. send list of done but not removed messages to other session
// - n-n session relations between MoneyNetwork and wallets? MoneyNetwork can have many wallets. A wallet can be used of many MoneyNetwork clones?
// - test offline transactions. for example a money transaction, send, receive, donate, pay, receive payment.
//   W2W transactions. Started by one MN user. Must by received by an other MN user
// - API handshake. MN and wallet sessions will normally use different MoneyNetworkAPI versions. validate all messages before send/after receive.
//   sessions must exchange list of supported/allowed messages.
//   json schema compare?
// - ping with permissions response? Or permissions check after wallet ping.
//   MN must know if send/receive money permission have been granted and if confirm transaction dialog is needed
// - wallet.json - add fee info. fee paid by sender, receiver or shared. fee added or subtracted from transaction amount
// - wallet.json - add external api url. for example https://www.blocktrail.com/api/docs for W2 (url er currency info)
// - use MN log syntax in in log. for example: <inner_path> fileWrite started. <inner_path> fileWrite finished. res = <res>
// - add MN debug messages for ZeroNet API calls. See debug_z_api_operation_start and debug_z_api_operation_end
// - add API version.
// - all throw. output error in log before throw. exception is not always reported correct back to calling code


// MoneyNetworkAPILib. Demon. Monitor and process incoming messages from other session(s)
var MoneyNetworkAPILib = (function () {

    var module = 'MoneyNetworkAPILib';

    // validate important objects
    // validate ZeroFrame. must have a cmd function
    function is_ZeroFrame (ZeroFrame) {
        if (!ZeroFrame) return false ;
        if (typeof ZeroFrame.cmd != 'function') return false ;
        return true ;
    }
    // validate MoneyNetworkAPI. must have [...] functions
    function is_MoneyNetworkAPI (encrypt) {
        var pgm = module + '.is_MoneyNetworkAPI: ' ;
        if (!encrypt) return false ;
        return encrypt instanceof MoneyNetworkAPI ;
    }

    // merged_type used in all inner_paths merged-<merge_type>/<hub>/data/users/<auth_address>/....
    // default is MoneyNetwork. used for user data hubs (MN) and wallet data hubs (wallets)
    var merged_type = 'MoneyNetwork' ;
    function set_merged_type (text) {
        merged_type = text ;
    }
    function get_merged_type () {
        return merged_type ;
    }

    // validate user_path format: merged-MoneyNetwork/<hub>/data/users/<auth_address>/
    var user_path_regexp ;
    (function(){
        var bitcoin_adr = '1[a-km-zA-HJ-NP-Z1-9]{25,34}' ;
        user_path_regexp = new RegExp('^merged-' + get_merged_type() + '\/' + bitcoin_adr + '\/data\/users\/' + bitcoin_adr + '\/$') ;
    })() ;
    function is_user_path (user_path) {
        if (typeof user_path != 'string') return false ;
        return user_path.match(user_path_regexp) ;
    } // is_user_path

    // readonly. most config values in MoneyNetworkAPILib is readonly
    function readonly(options, property, old_value) {
        var pgm = module + '.init: ';
        var error ;
        if (!old_value || !options[property] || (old_value == options[property])) return ;
        error = pgm +
            'invalid call. ' + property + ' cannot be changed. ' +
            'old value was ' + old_value + '. new value is ' + options[property] ;
        throw error ;
    } // readonly

    // this_user_path validation
    // 1: must be a user_path(is_user_path)
    // 2: readonly. not 100%. user can change ZeroId. OK but old MoneyNetworkAPI objects with old ZeroId must be destroyed
    // 3: user must be logged in and auth_address must be correct
    // should return true/false. maybe also in a cb function
    // should somethimes throw an error
    // should reset this_user_path after errors
    var this_user_path ;
    function set_this_user_path (user_path, options) {
        var cb, error, ok, other_session_filename, delete_sessions, i, encrypt ;
        if (!options) options = {} ;
        options = JSON.parse(JSON.stringify(options)) ;
        cb = typeof options.cb == 'function' ? options.cb : null ;
        error = function (text) {
            this_user_path = null ;
            if (cb) cb(text);
            if (options.throw) throw text ;
            return false ; // not working inside siteInfo callback
        };
        ok = function() {
            this_user_path = user_path ;
            if (cb) cb(null) ;
            return true ; // // not working inside siteInfo callback
        };
        if (!is_user_path(user_path)) return error('"' + user_path + '" is not a valid user path. please use "merged-' + get_merged_type() + '/<hub>/data/users/<auth_address>/" as user_path') ;
        if (options.readonly) {
            // readonly inside a MoneyNetworkAPI instance.
            readonly({this_user_path: user_path}, 'this_user_path', this_user_path) ;
        }
        else if (this_user_path && (user_path != this_user_path)) {
            // this_user_path changing in MoneyNetworkAPILib. OK to change user_path for this session, but any MoneyNetworkAPI instance using old user path is now invalid and must be destroyed
            delete_sessions = [] ;
            for (other_session_filename in sessions) {
                if (!sessions[other_session_filename].encrypt) continue ;
                if (sessions[other_session_filename].encrypt.destroyed) continue ;
                if (sessions[other_session_filename].this_user_path != this_user_path) continue ;
                delete_sessions.push(other_session_filename) ;
            }
            for (i=0 ; i<delete_sessions.length ; i++) {
                other_session_filename = delete_sessions[i] ;
                encrypt = sessions[other_session_filename].encrypt ;
                delete sessions[other_session_filename] ;
                encrypt.destroy('this_user_path changed') ;
            }
            if (delete_sessions.length && !Object.keys(sessions).length) {
                window.clearTimeout(demon_id) ;
                demon_id = null ;
            }
            this_user_path = null ;
        }
        if (!ZeroFrame) return error('ZeroFrame is required. Please inject ZeroFrame into MoneyNetworkAPILib before setting this_user_path') ;
        // check auth_address in this_user_path
        if (!cb) options.throw = true ;
        // assuming new this_user_path is connect
        this_user_path = user_path ;
        ZeroFrame.cmd("siteInfo", {}, function (site_info) {
            var regexp ;
            if (!site_info.cert_user_id) {
                this_user_path = null ;
                return error('invalid call. options.this_user_path must be null for a not logged in user') ;
            }
            regexp = new RegExp('\/' + site_info.auth_address + '\/$') ;
            if (!user_path.match(regexp)) {
                this_user_path = null ;
                return error('invalid call. auth_address in options.this_user_path is not correct. this_user_path = ' + user_path + '. site_info.auth_address = ' + site_info.auth_address) ;;
            }
            return ok() ;
        }); // siteInfo callback
        return true ; // result not ready. assuming OK
    } // set_this_user_path

    var debug = false, debug_seq = 0, z_debug_operations = {}, ZeroFrame, global_demon_cb, global_demon_cb_fileget,
        global_demon_cb_decrypt, interval, optional, group_debug_operations = {}, waiting_for_file_publish ;

    function config(options) {
        var pgm = module + '.config: ';
        var error, regexp, check_auth_address ;
        if (options.hasOwnProperty('debug')) debug = options.debug; // true, string or false
        if (options.ZeroFrame) {
            // required. inject ZeroFrame API into demon process
            if (!is_ZeroFrame(options.ZeroFrame)) throw pgm + 'invalid call. options.ZeroFrame is not a ZeroFrame API object' ;
            ZeroFrame = options.ZeroFrame;
        }
        if (options.cb) {
            // generic callback to handle all incoming messages. use wait_for_file to add callback for specific incoming messages and use add_session to add callback for a specific sessionid
            if (typeof options.cb != 'function') throw pgm + 'invalid call. options.cb is not a function' ;
            global_demon_cb = options.cb;
            if (options.cb_fileget) global_demon_cb_fileget = true ; // fileGet in demon process
            if (options.cb_decrypt) global_demon_cb_decrypt = true ; // decrypt in demon process
            if (global_demon_cb_decrypt) global_demon_cb_fileget = true ; // cannot decrypt without fileGet
            console.log(pgm + 'added a global cb for incoming messages. demon_cb_fileget = ' + global_demon_cb_fileget + ', demon_cb_decrypt = ' + global_demon_cb_decrypt) ;
        }
        if (options.interval) {
            // milliseconds between each demon check (dbQuery call). default 500 milliseconds between each check
            if (typeof options.interval != 'number') throw pgm + 'invalid call. options.interval is not a number' ;
            if (options.interval < 100) options.interval = 100 ;
            interval = options.interval;
        }
        if (options.optional) {
            // optional files pattern. add only if MoneyNetworkAPI should ensure optional files support in content.json file before sending message to other session
            if (typeof options.optional != 'string') throw pgm + 'invalid call. options.optional is not a string' ;
            readonly(options, 'optional', optional) ;
            try { regexp = new RegExp(options.optional)}
            catch (e) { throw pgm + 'invalid call. options.optional is an invalid regular expression' }
            optional = options.optional;
        }
        if (options.this_user_path) set_this_user_path(options.this_user_path, {throw: true}) ;
        if (options.merger_type) set_merged_type(options.merger_type) ;
        if (options.waiting_for_file_publish) {
            // wallet site publish function. For example retry failed publish operations.
            if (typeof options.waiting_for_file_publish != 'function') throw pgm + 'invalid call. options.waiting_for_file_publish must be a callback function' ;
            waiting_for_file_publish = options.waiting_for_file_publish ;
        }
    } // config

    // check if ZeroFrame has been injected into this library
    function get_ZeroFrame() {
        return ZeroFrame;
    } // get_ZeroFrame

    // check if optional pattern has been injected into this library
    function get_optional() {
        return optional ;
    }
    // check if user_path has been injected into this library
    function get_this_user_path() {
        return this_user_path ;
    }

    // debug ZeroFrame API calls.

    // debug_seq. used when monitoring ZeroFrame API operations and when tracking long running operations like send_message and process_incoming_message callback
    function debug_get_next_seq () {
        debug_seq++ ;
        return debug_seq ;
    } // debug_get_next_seq

    // call debug_z_api_operation_start before API call and debug_z_api_operation_end after API call
    // todo: add check for long running ZeroFrame API operations. Publish can take some time. optional fileGet can take some time. Other operations should be fast
    function debug_z_api_operation_pending () {
        var debug_seq, group_debug_seq, keys ;
        keys = [] ;
        for (debug_seq in z_debug_operations) {
            group_debug_seq = z_debug_operations[debug_seq].group_debug_seq ;
            keys.push(debug_seq + (group_debug_seq ? '/' + group_debug_seq : '')) ;
        }
        if (keys.length == 0) return 'No pending ZeroNet API operations' ;
        if (keys.length == 1) return '1 pending ZeroNet API operation (' + keys[0] + ')' ;
        return keys.length + ' pending ZeroNet API operations (' + keys.join(',') + ')' ;
    } // debug_z_api_operation_pending

    // params:
    // - pgm: calling pgm
    // - inner_path: optional inner_path.
    // - cmd: ZeroFrame cmd
    // - debug_this: null, true or false. debug option only for this call
    // - group_debug_seq: bundle sequence of connected ZeroFrame calls. For example send_message or process_incoming_message
    function debug_z_api_operation_start (pgm, inner_path, cmd, debug_this, group_debug_seq) {
        var debug_seq ;
        debug_seq = debug_get_next_seq() ;
        z_debug_operations[debug_seq] = {
            pgm: pgm,
            inner_path: inner_path,
            cmd: cmd,
            debug_this: debug_this,
            group_debug_seq: group_debug_seq,
            started_at: new Date().getTime()
        } ;
        // debug: "global" MoneyNetworkAPILib debug option (null, true, false or a string)
        if (debug || debug_this) console.log(
            pgm + (inner_path ? inner_path + ' ' : '') + cmd + ' started (' + debug_seq + (group_debug_seq ? '/' + group_debug_seq : '') + '). ' +
            debug_z_api_operation_pending()) ;
        return debug_seq ;
    } // debug_z_api_operation_start

    function debug_z_api_operation_end (debug_seq, res) {
        var pgm, inner_path, cmd, debug_this, started_at, finished_at, elapsed_time, group_debug_seq ;
        pgm = module + '.debug_z_api_operation_end: ' ;
        if (!z_debug_operations[debug_seq]) {
            console.log(pgm + 'error. ZeroNet API operation with seq ' + debug_seq + ' was not found') ;
            throw pgm + 'error. ZeroNet API operation with seq ' + debug_seq + ' was not found' ;
        }
        pgm = z_debug_operations[debug_seq].pgm ;
        inner_path = z_debug_operations[debug_seq].inner_path ;
        cmd = z_debug_operations[debug_seq].cmd ;
        debug_this = z_debug_operations[debug_seq].debug_this ;
        group_debug_seq = z_debug_operations[debug_seq].group_debug_seq ;
        started_at = z_debug_operations[debug_seq].started_at ;
        delete z_debug_operations['' + debug_seq] ;
        finished_at = new Date().getTime() ;
        elapsed_time = finished_at - started_at ;
        if (debug || debug_this) console.log(
            pgm + (inner_path ? inner_path + ' ' : '') + cmd + ' finished' + (res ? '. res = ' + JSON.stringify(res) : '') +
            '. elapsed time ' + elapsed_time + ' ms (' + debug_seq + (group_debug_seq ? '/' + group_debug_seq : '') + '). ' +
            debug_z_api_operation_pending()) ;
    } // debug_z_api_operation_end

    function validate_timeout_msg (timeout_msg) {
        if (typeof timeout_msg == 'string') return null ;
        if (!Array.isArray(timeout_msg)) return 'timeout_msg must be a string or an array with [type, message <,timeout> ]' ;
        if ((timeout_msg.length < 2) || (timeout_msg.length > 3)) return 'timeout_msg must be a string or an [type, message <,timeout>] notification array' ;
        if (['info', 'error', 'done'].indexOf(timeout_msg[0]) == -1) return 'first element in timeout_msg array must be info, error or done (type)' ;
        if (typeof timeout_msg[1] != 'string') return 'second element in timeout_msg array must be a string (message)' ;
        if (timeout_msg.length < 3) return null ;
        if (typeof timeout_msg[2] != 'number') return 'third element in timeout_msg array must be number (milliseconds)' ;
        if (timeout_msg[2] <= 0) return 'third element in timeout_msg array must be number (milliseconds)'
    } // validate_timeout_msg

    // monitor "long" running operations (request-response cycles) from start to end
    // normally starts in message_demon and ends when signing response to other process
    // add /<group_debug_seq> to console.log messages for each search in logs
    // keep stat about message processing from start to end. used in timeout notifications
    // todo: must add some session info to group_debug_operations. timeout message should only return info about current session
    function debug_group_operation_start () {
        var pgm = module + '.debug_group_operation_start: ' ;
        var group_debug_seq ;
        group_debug_seq = debug_get_next_seq() ;
        group_debug_operations[group_debug_seq] = { this_session_start_at: new Date().getTime() } ;
        return group_debug_seq ;
    } // debug_group_operation_start

    // add extra information about group debug operation. most important is msgtype as different msgtype may have different elapsed time
    function debug_group_operation_update (group_debug_seq, options) {
        var pgm = module + '.debug_group_operation_update: ' ;
        var pgm2, key, error ;
        if (!group_debug_operations[group_debug_seq])  {
            console.log(pgm + 'Error. Could not found any group operation with group_debug_seq ' + JSON.stringify(group_debug_seq));
            return ;
        }
        pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
        if (group_debug_operations[group_debug_seq].finish_at) {
            console.log(pgm2 + 'Error. Update is not alloowed. Has already set finish_at timestamp for group_debug_seq ' + group_debug_seq) ;
            return ;
        }
        if (!options) options = {} ;
        for (key in options) {
            if (group_debug_operations[group_debug_seq][key]) continue ;
            if (['this_session_start_at', 'this_session_finish_at', 'this_session_elapsed_time', 'this_session_error',
                    'other_session_start_at', 'other_session_finish_at', 'other_session_elapsed_time', 'sent_count'].indexOf(key) != -1) continue ;
            if (key == 'timeout_msg') {
                error = validate_timeout_msg(options.timeout_msg) ;
                if (error) {
                    console.log(pgm + 'invalid call. ' + error) ;
                    continue ;
                }
            }
            group_debug_operations[group_debug_seq][key] = options[key] ;
        } // for key
    } // debug_group_operation_update

    // end group debug operation. normally after signing response or when group operation is aborted for some reason
    function debug_group_operation_end (group_debug_seq, error) {
        var pgm = module + '.debug_group_operation_end: ' ;
        var pgm2 ;
        if (!group_debug_operations[group_debug_seq])  {
            console.log(pgm + 'Error. Could not found any group operation with group_debug_seq ' + group_debug_seq);
            return ;
        }
        pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
        if (group_debug_operations[group_debug_seq].finish_at) {
            console.log(pgm2 + 'Error. Has already set finish_at timestamp for group_debug_seq ' + group_debug_seq) ;
            return ;
        }
        if (error) group_debug_operations[group_debug_seq].this_session_error = error ;
        group_debug_operations[group_debug_seq].this_session_finish_at = new Date().getTime() ;
        group_debug_operations[group_debug_seq].this_session_elapsed_time = group_debug_operations[group_debug_seq].this_session_finish_at - group_debug_operations[group_debug_seq].this_session_start_at ;
        console.log(pgm2 + 'total elapsed time for group_debug_seq ' + group_debug_seq + ' was ' + group_debug_operations[group_debug_seq].this_session_elapsed_time + ' ms') ;
        console.log(pgm2 + 'group_debug_operations = ' + JSON.stringify(group_debug_operations[group_debug_seq])) ;
    } // debug_group_operation_end

    // timeout in communication. collect group operation stat to other process (request->response). Other process should adjust timeout in messages
    function debug_group_operation_get_stat (encrypt) {
        var pgm = module + '.debug_group_operation_get_stat: ' ;
        var group_debug_seq, stat ;
        if (!is_MoneyNetworkAPI(encrypt)) throw pgm + 'invalid call. required parameter encrypt must be a MoneyNetworkAPI instance' ;
        if (!encrypt.this_session_filename) {
            console.log(pgm + 'error. encrypt.this_session_filename is not initialized') ;
            return [] ;
        }
        stat = [] ;
        // console.log(pgm + 'this_session_filename = ' + encrypt.this_session_filename) ;
        //this_session_filename = 4e545024a7
        // console.log(pgm + 'group_debug_operations = ' + JSON.stringify(group_debug_operations)) ;
        //group_debug_operations = {
        //    "27": {
        //        "this_session_start_at": 1510743385811,
        //        "this_session_filename": "4e545024a7",
        //        "direction": "in",
        //        "filename": "5e901f6760-i.1510743365584",
        //        "msgtype": "get_password",
        //        "this_session_finish_at": 1510743408797,
        //        "this_session_elapsed_time": 22986
        //    }
        //};
        for (group_debug_seq in group_debug_operations) {
            if (encrypt.this_session_filename != group_debug_operations[group_debug_seq].this_session_filename) continue ; // not this session
            if (group_debug_operations[group_debug_seq].this_session_error) continue ; // cannot use this information. not a full request-response cycle
            if (!group_debug_operations[group_debug_seq].filename) continue ; // error or not yet any filename for this group debug operation
            if (!group_debug_operations[group_debug_seq].msgtype) continue ; // error. no msgtype for this group debug operation
            if (group_debug_operations[group_debug_seq].direction != 'in') continue ; // not an incoming request
            if (!group_debug_operations[group_debug_seq].this_session_finish_at) continue ; // wait. group operation is not yet finished
            // check sent count. send info twice to other session just to be sure
            if (!group_debug_operations[group_debug_seq].sent_count) group_debug_operations[group_debug_seq].sent_count = 0 ;
            if (group_debug_operations[group_debug_seq].sent_count > 2) continue ;
            group_debug_operations[group_debug_seq].sent_count++ ;
            // send operation info to other session
            stat.push({
                filename: group_debug_operations[group_debug_seq].filename,
                msgtype: group_debug_operations[group_debug_seq].msgtype,
                start_at: group_debug_operations[group_debug_seq].this_session_start_at,
                finish_at: group_debug_operations[group_debug_seq].this_session_finish_at
            }) ;
        }
        if (!stat.length) console.log(pgm + 'warning. could not find any group operations for this session') ;
        return stat ;
    } // debug_group_operation_get_stat

    // receive timeout message stat from other session. May be contain additional info about a previous timeout response error in this session
    function debug_group_operation_receive_stat (encrypt, stat) {
        var pgm = module + '.debug_group_operation_receive_stat: ' ;
        var i, group_debug_seq, pgm2, timeout_msg ;
        // console.log(pgm + 'group_debug_operations (before) = ' + JSON.stringify(group_debug_operations)) ;
        // console.log(pgm + 'stat = ' + JSON.stringify(stat)) ;
        if (!is_MoneyNetworkAPI(encrypt)) throw pgm + 'invalid call. required parameter encrypt must be a MoneyNetworkAPI instance' ;
        if (!encrypt.this_session_filename) {
            console.log(pgm + 'error. encrypt.this_session_filename is not initialized') ;
            return ;
        }

        for (i=0 ; i<stat.length ; i++) {
            for (group_debug_seq in group_debug_operations) {
                if (group_debug_operations[group_debug_seq].this_session_filename != encrypt.this_session_filename) continue ; // not this session
                if (group_debug_operations[group_debug_seq].filename != stat[i].filename) continue ; // not this file
                if (group_debug_operations[group_debug_seq].other_session_start_at) break ; // already received
                if (group_debug_operations[group_debug_seq].msgtype != stat[i].msgtype) {
                    console.log(pgm + 'warning. identical filename but different msgtype. ' +
                        'group_debug_seq = ' + group_debug_seq + ', stat = ' + JSON.stringify(stat[i]) +
                        ', group_debug_operations = ' + JSON.stringify(group_debug_operations[group_debug_seq])) ;
                }
                group_debug_operations[group_debug_seq].other_session_start_at = stat[i].start_at ;
                group_debug_operations[group_debug_seq].other_session_finish_at = stat[i].finish_at ;
                group_debug_operations[group_debug_seq].other_session_elapsed_time = stat[i].finish_at - stat[i].start_at ;
                pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                console.log(pgm2 + 'received stat from other session about previous ' + stat[i].msgtype + ' request. group_debug_operations = ' + JSON.stringify(group_debug_operations[group_debug_seq]));
                // display timeout_msg?
                //group_debug_operations = {
                //    "this_session_start_at": 1511542656372,
                //    "msgtype": "ping",
                //    "timeout_msg": ["info", "Issue with ping wallet timeout may have been solved<br>Please try again (Approve money transaction)", 10000],
                //    "this_session_filename": "88fdcc5c30",
                //    "filename": "88fdcc5c30-i.1511542656375",
                //    "this_session_error": "Timeout. ping response was not received",
                //    "this_session_finish_at": 1511542667512,
                //    "this_session_elapsed_time": 11140,
                //    "other_session_start_at": 1511542658867,
                //    "other_session_finish_at": 1511542681855,
                //    "other_session_elapsed_time": 22988
                //};
                if (group_debug_operations[group_debug_seq].this_session_error &&
                    group_debug_operations[group_debug_seq].this_session_error.match(/^timeout/i) &&
                    group_debug_operations[group_debug_seq].timeout_msg) {
                    timeout_msg = group_debug_operations[group_debug_seq].timeout_msg ;
                    console.log(pgm + 'display timeout_msg = ' + JSON.stringify(timeout_msg)) ;
                    if (typeof timeout_msg == 'string') timeout_msg = ['info', timeout_msg, 10000] ;
                    ZeroFrame.cmd("wrapperNotification", timeout_msg) ;
                }
                break ;
            }
        }
        // console.log(pgm + 'group_debug_operations (after) = ' + JSON.stringify(group_debug_operations)) ;
        // group_debug_operations (after) = {
        //    "75": {
        //        "this_session_start_at": 1510761567341,
        //        "msgtype": "balance",
        //        "this_session_filename": "82356e9dcf",
        //        "filename": "82356e9dcf-i.1510761567353",
        //        "this_session_error": "Timeout. balance response was not received",
        //        "this_session_finish_at": 1510761573453,
        //        "this_session_elapsed_time": 6112,
        //        "other_session_start_at": 1510761569914,
        //        "other_session_finish_at": 1510761592947,
        //        "other_session_elapsed_time": 23033
        //    }
        //};

    } // debug_group_operation_receive_stat

    // lookup rows in group_debug_operations for this message type. Use other session elapsed time + 2 seconds
    function debug_group_operation_get_response(msgtype, encrypt) {
        var pgm = module + '.debug_group_operation_get_response: ' ;
        var group_debug_seq, elapsed, min, max, sum, avg, count ;
        if (!is_MoneyNetworkAPI(encrypt)) throw pgm + 'invalid call. required parameter encrypt must be a MoneyNetworkAPI instance' ;
        if (!encrypt.this_session_filename) {
            console.log(pgm + 'error. encrypt.this_session_filename is not initialized') ;
            return ;
        }
        count = 0 ;
        sum = 0 ;
        for (group_debug_seq in group_debug_operations) {
            if (group_debug_operations[group_debug_seq].this_session_filename != encrypt.this_session_filename) continue ; // not this session
            if (group_debug_operations[group_debug_seq].msgtype != msgtype) continue ; // not this msgtype
            if (!group_debug_operations[group_debug_seq].this_session_finish_at) continue ; // still running
            if (!group_debug_operations[group_debug_seq].other_session_start_at) continue ; // not yet received any info from other session
            if (group_debug_operations[group_debug_seq].this_session_error &&
                !group_debug_operations[group_debug_seq].this_session_error.match(/^timeout/i)) continue ; // error and not a timeout error
            elapsed = group_debug_operations[group_debug_seq].other_session_elapsed_time + 3000 ; // adding extra overhead.
            if (count) {
                if (elapsed < min) min = elapsed ;
                if (elapsed > max) max = elapsed ;
            }
            else {
                min = elapsed ;
                max = elapsed ;
            }
            sum = sum + elapsed ;
            count++ ;
        } // for
        if (count == 0) {
            console.log(pgm + 'no process info found for msgtype ' + msgtype) ;
            return ;
        }
        avg = Math.round(sum / count) ;
        console.log(pgm + 'msgtype = ' + msgtype + ', count = ' + count + ', min = ' + min + ', max = ' + max + ', avg = ' + avg) ;
        return max ;
    } // debug_group_operation_get_response

    // global variables client and master. used in MN <=> wallet communication:
    // - client false/master true; MoneyNetwork, site_address !=  1JeHa67QEvrrFpsSow82fLypw8LoRcmCXk. server = true
    // - client true/master false: MoneyNetwork wallet. site_address == '1JeHa67QEvrrFpsSow82fLypw8LoRcmCXk, master = false
    // for wallet to wallet communication is sender=master and receiver=client
    // used for this_session_filename, other_session_filename, send_message, demon process etc
    var client, server; // null, x, true or false
    var is_client_cbs = []; // callbacks waiting for is_client response
    function is_client(cb) {
        var pgm = module + '.is_client: ';
        var debug_seq ;
        if (!ZeroFrame) throw pgm + 'ZeroFrame is missing. Please use ' + module + '.init({ZeroFrame:xxx}) to inject ZeroFrame API into this library';
        if (!cb) cb = function () {};
        if (client == 'x') {
            // wait. first is_client request is executing
            is_client_cbs.push(cb);
            if (debug) console.log(pgm + 'client = x. is_client.length = ' + is_client_cbs.length) ;
            return;
        }
        if ([true, false].indexOf(client) != -1) return cb(client); // ready
        // first is_client request. check site address and set client = true or false. x while executing
        client = 'x';
        debug_seq = debug_z_api_operation_start(pgm, 'n/a', 'siteInfo') ;
        ZeroFrame.cmd("siteInfo", {}, function (site_info) {
            var pgm = module + '.is_client siteInfo callback: ' ;
            debug_z_api_operation_end(debug_seq, site_info ? 'Ok' : 'Failed') ;
            client = (site_info.address != '1JeHa67QEvrrFpsSow82fLypw8LoRcmCXk');
            server = !client ;
            if (debug) console.log(pgm + 'client = ' + client + '. is_client_cbs.length = ' + is_client_cbs.length) ;
            cb(client);
            while (is_client_cbs.length) {
                cb = is_client_cbs.shift();
                cb(client)
            }
        });
    } // is_client

    // add session to watch list, First add session call will start a demon process checking for incoming messages
    // - session: hash with session info or api client returned from new MoneyNetworkAPI() call
    // - optional cb: function to handle incoming message. cb function must be supplied in init or
    var demon_id;
    var sessions = {}; // other session filename => session info
    var done = {}; // filename => cb or true. cb: callback waiting for file. true: processed
    var offline = {}; // other session filename => true (loading) or array with offline transactions
    // options:
    // - cb: session level callback function to handle incoming messages for this sessionid
    // - encrypt: MoneyNetworkAPI instance for this sessionid. Used for encrypt and decrypt. injected into callback function
    // - constructor: called from MoneyNetworkAPI constructor. error message is not reported back in catch (e) { e.message }
    function add_session(sessionid, options) {
        var pgm = module + '.add_session: ';
        var cb, encrypt, sha256, constructor, error, session_at, is_client2, cb_fileget, cb_decrypt ;
        if (typeof options == 'object') constructor = options.constructor ;
        error = function (text) {
            if (constructor) console.log(pgm + text) ; // new MoneyNetworkAPI. no error.message in catch
            throw pgm + text ;
        } ;
        if (typeof sessionid != 'string') error('invalid call. param 1 sessionid must be a string') ;
        if (['', 'undefined'].indexOf(sessionid) != -1) error('invalid call. param 1 sessionid "' + sessionid + '" is not allowed') ;
        if (!options) options = {} ;
        if (typeof options != 'object') error('invalid call. param 2 options must be an object') ;
        cb = options.cb ;
        encrypt = options.encrypt ;
        if (cb && (typeof cb != 'function')) error('invalid call. param 2 options.cb must be null or a callback function to handle incoming messages') ;
        if (encrypt && !is_MoneyNetworkAPI(encrypt)) error('invalid call. param 2 options.encrypt must be null or an instance of MoneyNetworkAPI') ;
        if (options.cb_fileget) cb_fileget = true ;
        if (options.cb_decrypt) cb_decrypt = true  ;
        session_at = new Date().getTime() ;
        if (encrypt) encrypt.session_at = session_at ;
        sha256 = CryptoJS.SHA256(sessionid).toString();
        if (typeof client == 'undefined') {
            // todo: this looks strange ...
            if (debug) console.log(pgm + 'todo: first is_client request. get_sessions request must wait for is_client request to finish') ;
            is_client_cbs.push(function() {}) ;
        }
        // extend is_client.
        is_client2 = function (cb) {
            if (encrypt && (encrypt.receiver || encrypt.sender)) cb(encrypt.receiver) ; // instance level master/client role. W2W communication
            else is_client(cb) ; // global level master/client role. M2W communication. MN is master, wallet is client.
        } ;
        is_client2(function (client) {
            var this_session_filename, other_session_filename, start_demon ;
            this_session_filename = client ? sha256.substr(sha256.length - 10) : sha256.substr(0, 10) ;
            other_session_filename = client ? sha256.substr(0, 10) : sha256.substr(sha256.length - 10);
            // if (debug) console.log(pgm + 'sessionid = ' + sessionid + ', sha256 = ' + sha256 + ', wallet = ' + wallet + ', other_session_filename = ' + other_session_filename);
            // if (sessions[other_session_filename]) return null; // known sessionid
            start_demon = (Object.keys(sessions).length == 0);
            if (!sessions[other_session_filename]) {
                if (debug) console.log(pgm + 'monitoring other_session_filename ' + other_session_filename + ', sessionid = ' + sessionid);
                sessions[other_session_filename] = {
                    sessionid: sessionid,
                    session_at: session_at,
                    this_session_filename: this_session_filename
                };
            }
            else console.log(pgm + 'todo: warning. multiple add_session calls for other_session_filename ' + other_session_filename) ;
            if (cb) sessions[other_session_filename].cb = cb ;
            if (cb_fileget) sessions[other_session_filename].cb_fileget = cb_fileget ;
            if (cb_decrypt) sessions[other_session_filename].cb_decrypt = cb_decrypt ;
            if (cb_decrypt) cb_fileget = true ;
            if (encrypt) sessions[other_session_filename].encrypt = encrypt ;
            if (start_demon) {
                demon_id = setInterval(message_demon, (interval || 500));
                if (debug) console.log(pgm + 'Started demon. process id = ' + demon_id);
            }
            //if (debug) {
            //    // list sessions and debug info. See issue https://github.com/jaros1/Money-Network-W2/issues/15
            //    for (other_session_filename in sessions) {
            //        encrypt = sessions[other_session_filename].encrypt ;
            //        console.log(pgm + 'other_session_filename ' + other_session_filename + (encrypt && encrypt.debug ? ' should be processed by ' + encrypt.debug : '')) ;
            //    }
            //}
        }); // is_client callback
    } // add_session

    // return session
    function get_session (sessionid, cb) {
        var pgm = module + '.get_session: ' ;
        var retry_get_session, fake_is_client_cb, other_session_filename, session_info ;
        if (debug) console.log(pgm + 'is_client_cbs.length = ' + is_client_cbs.length) ;
        if (is_client_cbs.length) {
            // wait for is_client queue to empty before returning sessions (get_session_filenames)
            retry_get_session = function() {
                get_session(sessionid, cb) ;
            };
            fake_is_client_cb = function() {
                // wait a moment to empty is_client_cbs queue
                setTimeout(retry_get_session, 200) ;
            };
            is_client_cbs.push(fake_is_client_cb) ;
            return ;
        }
        for (other_session_filename in sessions) {
            session_info = sessions[other_session_filename];
            if (session_info.encrypt && session_info.encrypt.destroyed) continue;
            if (session_info.sessionid != sessionid) continue ;
            console.log(pgm + 'found session with sessionid ' + sessionid) ;
            return cb(session_info) ;
        }
        console.log(pgm + 'could not find any session with sessionid ' + sessionid) ;
        cb() ;
    } // get_session

    function get_sessions (cb) {
        var pgm = module + '.get_sessions: ' ;
        var array, other_session_filename, session_info1, session_info2, key, retry_get_sessions, fake_is_client_cb ;
        if (debug) console.log(pgm + 'is_client_cbs.length = ' + is_client_cbs.length) ;
        if (is_client_cbs.length) {
            // wait for is_client_cbs queue to empty before returning sessions (get_session_filenames)
            retry_get_sessions = function() {
                get_sessions(cb) ;
            };
            fake_is_client_cb = function() {
                // wait a moment to empty is_client_cbs queue
                setTimeout(retry_get_sessions, 200) ;
            };
            is_client_cbs.push(fake_is_client_cb) ;
            return ;
        }

        array = [] ;
        for (other_session_filename in sessions) {
            session_info1 = sessions[other_session_filename] ;
            if (session_info1.encrypt && session_info1.encrypt.destroyed) continue ;
            session_info2 = { other_session_filename: other_session_filename} ;
            for (key in session_info1) {
                if (!session_info1.hasOwnProperty(key)) continue ;
                if (key == 'encrypt') continue ; // Blocked a frame with origin "null" from accessing a cross-origin frame error for returned encrypt object?!
                session_info2[key] = session_info1[key] ;
            } // for key
            array.push(session_info2) ;
        } // for other_session_filename
        cb(array) ;
    } // get_sessions

    // delete session. session removed by client.
    function delete_session (sessionid) {
        var pgm = module + '.delete_session: ' ;
        var other_session_filename ;
        for (other_session_filename in sessions) {
            if (sessions[other_session_filename].sessionid != sessionid) continue ;
            delete sessions[other_session_filename] ;
            if (Object.keys(sessions).length) {
                window.clearTimeout(demon_id) ;
                demon_id = null ;
            }
            return true ;
        }
        if (debug) console.log(pgm + 'Unknown sessionid ' + sessionid) ;
        return false ;
    } // delete_session

    // delete all sessions and stop demon process. for example after client log out
    function delete_all_sessions() {
        var other_session_filename, count ;
        if (Object.keys(sessions).length) {
            window.clearTimeout(demon_id) ;
            demon_id = null ;
        }
        count = 0 ;
        for (other_session_filename in sessions) {
            delete sessions[other_session_filename] ;
            count++ ;
        }
        return count ;
    } // delete_all_sessions

    // delete all sessions and reset all data in this lib
    function clear_all_data() {
        delete_all_sessions() ;
        debug = null ;
        ZeroFrame = null ;
        global_demon_cb = null ;
        interval = null ;
        optional = null ;
        this_user_path = null ;
    } // clear_all_data

    // return true if demon is monitoring incoming messages for sessionid
    function is_session(sessionid) {
        var pgm = module + '.add_session: ';
        var sha256;
        sha256 = CryptoJS.SHA256(sessionid).toString();
        return (sessions[sha256.substr(0, 10)] || sessions[sha256.substr(sha256.length - 10)]) ;
    } // is_session

    // register callback to handle incoming message (response) with this filename
    // options:
    // - request: request json message. for debug messages
    // - timeout_at: ńumber of ms before timeout.
    // - cb: callback to handle incoming message
    // - cb_fileget: boolean: fileGet file before calling callback cb
    // - cb_decrypt: boolean: decrypt message before calling callback cb
    // - countdown_cb: special callback called once every second to update remaining time before timeout in UI
    function wait_for_file(response_filename, options) {
        var pgm = module + '.wait_for_file: ';
        var error, session_filename, timeout_at, cb_fileget, cb_decrypt, countdown_cb ;
        error = function (error) {
            console.log(pgm + error) ;
            return error ;
        };
        // check parameters
        // parameter 1: response_filename
        if (typeof response_filename != 'string') return error('invalid call. expected response_filename to be a string. response_filename = ' + JSON.stringify(response_filename));
        if (!response_filename.match(/^[0-9a-f]{10}(-i|-e|-o|-io|-p)?\.[0-9]{13}$/)) return error('invalid call. invalid response_filename = ' + response_filename + '. invalid format');
        session_filename = response_filename.substr(0,10) ;
        if (!sessions[session_filename]) return error('invalid call. invalid param 1 response_filename = ' + response_filename + '. unknown other session filename ' + session_filename);
        // parameter 2: options
        if (!options) options = {} ;
        if (options.request) {
            if (typeof options.request != 'object') return error('invalid call. expected options.request to be a object. null or request json message. options.request = ' + JSON.stringify(options.request));
            if (!options.request.msgtype) return error('invalid call. expected options.request to have a msgtype. request = ' + JSON.stringify(request));
        }
        if (options.timeout_at && (typeof options.timeout_at != 'number')) return error('invalid call. options.timeout_at is not a unix timestamp. timeout_at = ' + JSON.stringify(options.timeout_at));
        if (options.cb && (typeof options.cb != 'function')) return error('invalid call. expected options.cb be a function. cb = ' + JSON.stringify(options.cb));
        if (done[response_filename]) return error(response_filename + ' already done or callback object already defined');
        if (!options.cb) {
            if (debug) console.log(pgm + 'ignoring incoming message with filename ' + response_filename + '. options.request = ' + JSON.stringify(options.request)) ;
            done[response_filename] = true ;
            return null ;
        }
        if (options.hasOwnProperty('cb_fileget')) cb_fileget = options.cb_fileget ? true : false ;
        if (options.hasOwnProperty('cb_decrypt')) cb_decrypt = options.cb_decrypt ? true : false ;
        if (cb_decrypt) cb_fileget = true ;
        if (options.countdown_cb) {
            if (typeof options.countdown_cb != 'function') return error('invalid call. options.countdown_cb must be a callback function') ;
            countdown_cb = options.countdown_cb ;
        }
        timeout_at = options.timeout_at || ((new Date().getTime()) + 30000);
        done[response_filename] = {
            request: options.request,
            timeout_at: timeout_at,
            cb: options.cb,
            cb_fileget: cb_fileget,
            cb_decrypt: cb_decrypt,
            countdown_cb: countdown_cb
        };
        if (debug) console.log(pgm + 'added a callback function for ' + response_filename + '. request = ' + JSON.stringify(options.request) + ', done[' + response_filename + '] = ' + JSON.stringify(done[response_filename]));
        return null;
    } // wait_for_file


    // ask message_demon to reprocess already done file
    // fallback used in case of lost messages or files arriving in wrong order
    // see receive w2_check_mt message in w2 process_incoming_message (test bitcoin wallet)
    function redo_file (request_filename) {
        var pgm = module + '.redo_file: ' ;
        if (!done[request_filename]) {
            if (debug) console.log(pgm + request_filename + ' was not found in done') ;
            return 'Not found in done' ;
        }
        if (done[request_filename] == true) {
            delete done[request_filename] ;
            if (debug) console.log(pgm + request_filename + ' was removed from done') ;
            return null ;
        }
        // must be a callback object
        if (debug) console.log(pgm + 'callback is already waiting for ' + request_filename) ;
        return 'Callback is already waiting for this file' ;
    } // redo_file


    var timestamp_re = /^[0-9]{13}$/ ;
    function message_demon() {
        var pgm = module + '.message_demon: ';
        var filename, api_query_1, session_filename, first, now, timeout_in, countdown, call_countdown_cb, group_debug_seq;
        // check for expired callbacks. processes waiting for a response
        now = new Date().getTime();
        for (filename in done) {
            if (done[filename] == true) continue;
            if (done[filename].timeout_at > now) {
                if (debug) {
                    // log at start and and once every 5 seconds
                    timeout_in = done[filename].timeout_in || -1 ;
                    done[filename].timeout_in = Math.round((done[filename].timeout_at - now) / 1000) ;
                    if ((timeout_in == -1) ||
                        ((done[filename].timeout_in % 5 == 0) && (timeout_in != done[filename].timeout_in))) {
                        console.log(pgm + 'timeout_in = ' + done[filename].timeout_in + ', done[' + filename + ']=' + JSON.stringify(done[filename]) + ', now = ' + now) ;
                    }
                }
                if (done[filename].countdown_cb) {
                    // call special countdown_cb function once every second while waiting for timeout countdown in UI (spinner)
                    call_countdown_cb = false ;
                    countdown = Math.round((done[filename].timeout_at - now) / 1000) ;
                    if (typeof done[filename].last_countdown == 'number') {
                        if (countdown != done[filename].last_countdown) call_countdown_cb = true ;
                    }
                    else call_countdown_cb = true ;
                    done[filename].last_countdown = countdown ;
                    if (call_countdown_cb) done[filename].countdown_cb(countdown) ;
                }
                continue;
            }
            if (debug) console.log(pgm + 'timeout. running callback for ' + filename);
            try {
                done[filename].cb({error: 'Timeout while waiting for ' + filename + '. request was ' + JSON.stringify(done[filename].request)});
            }
            catch (e) {
                console.log(pgm + 'Error when processing incomming message ' + filename + '. error = ' + e.message + '. request was ' + JSON.stringify(done[filename].request))
            }
            done[filename] = true;
        } // for i
        // find any new messages
        first = true;
        api_query_1 =
            "select json.directory, all_files.filename, keyvalue.value as modified " +
            "from (select filename, json_id from files " +
            "        union all " +
            "      select filename, json_id from files_optional) as all_files, json, keyvalue " +
            "where ";
        for (session_filename in sessions) {
            api_query_1 += first ? "(" : " or ";
            api_query_1 += "all_files.filename like '" + session_filename + "%'";
            first = false ;
        }
        api_query_1 +=
            ") and json.json_id = all_files.json_id " +
            "and keyvalue.json_id = json.json_id and keyvalue.key = 'modified' " +
            "order by substr(all_files.filename, instr(all_files.filename,'.')+1)";
        if (first) {
            console.log(pgm + 'error. no sessions were found');
            clearInterval(demon_id);
            return;
        }
        // if (debug) console.log(pgm + 'api query 1 = ' + api_query_1) ;
        // debug_seq = debug_z_api_operation_start(pgm, 'api query 1', 'dbQuery') ;
        ZeroFrame.cmd("dbQuery", [api_query_1], function (res) {
            var pgm = module + '.message_demon dbQuery callback: ';
            var i, directory, filename, session_filename, file_timestamp, cb, other_user_path, inner_path, encrypt,
                pos, re, match, optional, now, fileget, decrypt, step_1_fileget, step_2_decrypt, step_3_run_cb, modified,
                pgm2, direction;
            // debug_z_api_operation_end(debug_seq, !res || res.error ? 'failed' : 'OK') ;
            if (res.error) {
                console.log(pgm + 'query failed. error = ' + res.error);
                console.log(pgm + 'query = ' + api_query_1);
                clearInterval(demon_id);
                return;
            }
            now = new Date().getTime();
            // sql filename like check is weak. regular expressions not supported by zeronet sqlite db. full check now
            re = /^[0-9a-f]{10}(-i|-e|-o|-io|-p)?\.[0-9]{13}$/ ;

            // process new incoming messages
            for (i = 0; i < res.length; i++) {
                directory = res[i].directory;
                filename = res[i].filename;
                modified = res[i].modified ;
                match = filename.match(re) ;
                if (!match) {
                    console.log(pgm + 'ignoring incoming message with invalid filename ' + filename) ;
                    continue ;
                }
                optional = match[1] ;
                session_filename = filename.substr(0,10) ;
                if (done[filename] == true) continue; // already done

                // console.log(pgm + 'filename = ' + filename + ', optional = ' + optional) ; // should be filename modifier (null, -i, -e, -o, -io or -p)
                // check file timestamp (filetype)
                pos = filename.indexOf('.') ;
                file_timestamp = pos == -1 ? '' : filename.substr(pos+1) ;
                if (!file_timestamp.match(timestamp_re)) {
                    if (debug) console.log(pgm + 'invalid filename ' + filename + '. must end with a 13 digits timestamp. file_timestamp was ' + file_timestamp) ;
                    done[filename] = true;
                    continue;
                }
                // check file timestamp. ignore old messages. ignore messages in the future. other client clock maybe wrong
                file_timestamp = parseInt(file_timestamp) ;
                encrypt = sessions[session_filename].encrypt ;

                if (!done[filename] && encrypt && encrypt.session_at && (['-o', '-io'].indexOf(optional) == -1)) {
                    // not a response. not a offline transaction. compare file timestamp with session start
                    if (file_timestamp + 60000 - encrypt.session_at < 0) {
                        console.log(pgm + 'ignoring old incoming message ' + filename + '. session started at ' + encrypt.session_at) ;
                        done[filename] = true ;
                        continue ;
                    }
                }
                if (file_timestamp - now - 60000 > 0) {
                    console.log(pgm + 'ignoring incoming message ' + filename + ' with timestamp in the future. now = ' + now) ;
                    done[filename] = true ;
                    continue ;
                }
                other_user_path = 'merged-' + get_merged_type() + '/' + directory + '/' ;
                inner_path = other_user_path + filename;
                if (!encrypt.other_user_path) encrypt.setup_encryption({other_user_path: other_user_path}) ;
                if (other_user_path != encrypt.other_user_path) {
                    console.log(pgm + 'Rejected incoming message ' + inner_path + '. Expected incoming messages for this session to come from ' + encrypt.other_user_path) ;
                    done[filename] = true;
                    continue ;
                }

                group_debug_seq = debug_group_operation_start() ;
                pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                if (debug) console.log(pgm2 + 'Using group_debug_seq ' + group_debug_seq + ' for this incoming message') ;

                // find cb and fileget and decrypt options.
                if (done[filename]) {
                    // message level callback. see wait_for_file. must be a response to a previous request
                    direction = 'out' ;
                    cb = done[filename].cb ;
                    fileget = done[filename].hasOwnProperty('cb_fileget') ? done[filename].cb_fileget : (sessions[session_filename].hasOwnProperty('cb_fileget') ? sessions[session_filename].fileget : global_demon_cb_fileget);
                    decrypt = done[filename].hasOwnProperty('cb_decrypt') ? done[filename].cb_decrypt : (sessions[session_filename].hasOwnProperty('cb_decrypt') ? sessions[session_filename].decrypt : global_demon_cb_decrypt);
                    console.log(pgm2 + 'using message level callback. fileget = ' + fileget + ', decrypt = ' + decrypt) ;
                }
                else if (sessions[session_filename].cb) {
                    // MoneyNetworkAPI instance callback. see new MoneyNetworkAPI / MoneyNetworkAPI.setup_encryption
                    direction = 'in' ;
                    cb = sessions[session_filename].cb ;
                    fileget = sessions[session_filename].hasOwnProperty('fileget') ? sessions[session_filename].cb_fileget : global_demon_cb_fileget;
                    decrypt = sessions[session_filename].hasOwnProperty('decrypt') ? sessions[session_filename].cb_decrypt : global_demon_cb_decrypt;
                    console.log(pgm2 + 'using MoneyNetworkAPI instance callback. fileget = ' + fileget + ', decrypt = ' + decrypt) ;
                }
                else {
                    // global callback. See MoneyNetworkAPILib.config
                    direction = 'in' ;
                    cb = global_demon_cb;
                    fileget = global_demon_cb_fileget ;
                    decrypt = global_demon_cb_decrypt ;
                    console.log(pgm2 + 'using global callback. fileget = ' + fileget + ', decrypt = ' + decrypt) ;
                }
                if (!cb) {
                    console.log(pgm2 + 'Error when processing incomming message ' + inner_path + '. No process callback found');
                    done[filename] = true;
                    continue;
                }
                if (optional == '-p') {
                    // published messages. processed by demon. not by injected callbacks
                    fileget = true ;
                    decrypt = true ;
                    // hijack cb.
                    cb = process_publish_messages ;
                }
                if (decrypt) fileget = true ;

                // callback chain step 1-3 with optional fileGet and decrypt operations
                step_3_run_cb = function (extra, encrypted_json, json) {
                    var pgm = module + '.message_demon.step_3_run_cb: ';
                    pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                    if (!extra) extra = {} ;
                    extra.modified = modified ; // content.json modified timestamp.
                    extra.fileget = fileget ; // true: fileGet in message_demon
                    extra.decrypt = decrypt ; // true: decrypt in message_demon
                    // calculate overhead. sending and receiving. sender and receiver must add overhead to timeout
                    extra.send_overhead = (extra.modified - Math.floor(file_timestamp/1000)) * 1000  ;
                    if (extra.decrypt_at) extra.receive_overhead = extra.decrypt_at - extra.db_query_at ;
                    else extra.receive_overhead = 0 ;
                    extra.total_overhead = extra.send_overhead + extra.receive_overhead ;
                    // call cb
                    if (debug) console.log(pgm2 + 'calling cb with ' + inner_path + (encrypt.debug ? ' and ' + encrypt.debug : '')) ;
                    try { cb(inner_path, encrypt, encrypted_json, json, extra) }
                    catch (e) { console.log(pgm2 + 'Error when processing incomming message ' + inner_path + '. error = ' + e.message)}
                } ;
                step_2_decrypt = function (extra, encrypted_json) {
                    var pgm = module + '.message_demon.step_2_decrypt: ';
                    pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                    if (!decrypt) return step_3_run_cb(extra, encrypted_json, null) ; // cb must decrypt
                    encrypt.decrypt_json(encrypted_json, {group_debug_seq: extra.group_debug_seq}, function (json) {
                        extra.decrypt_at = new Date().getTime() ;
                        step_3_run_cb(extra, encrypted_json, json) ;
                    }) ;
                } ;
                step_1_fileget = function() {
                    var pgm = module + '.message_demon.step_1_fileget: ';
                    var options ;
                    if (!fileget) return step_3_run_cb({db_query_at: now}, null, null) ; // cb must fileGet and decrypt
                    // received a incoming message. use /group_debug_seq to follow request-response cycle from start to end.
                    // information used in debugging and in timeout message
                    pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                    encrypt.get_session_filenames({}, function(this_session_filename, other_session_filename, unlock_pwd2) {
                        var pgm = module + '.message_demon.step_1_fileget get_session_filenames callback 1: ';
                        var pgm2, waiting_for_file ;
                        pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                        MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {this_session_filename: this_session_filename, direction: direction, filename: (direction == 'in' ? filename : null)}) ;
                        options = { inner_path: inner_path} ;
                        // filetypes: -i, -e, -o, -io, -p
                        if (['-e', '-o'].indexOf(optional) != -1) {
                            // wallet to wallet communication. fileGet often fails for optional fileGet. 0 or 1 peer. wait for max 5 minutes (5*60 seconds)
                            options.required = true ;
                            options.timeout = 60 ;
                            options.timeout_count = 5 ;
                            if (encrypt.hasOwnProperty('sender')) {
                                // wallet to wallet communication. workaround for failed fileGet operation (timeout). Send a waiting_for_file notification after first timeout (after 60 seconds)
                                // use normal file for waiting_for_file message and do not wait for response
                                waiting_for_file = function() {
                                    var pgm = module + '.message_demon.step_1_fileget.waiting_for_file: ';
                                    var group_debug_seq, pgm2, request, encryptions ;
                                    group_debug_seq = debug_group_operation_start() ;
                                    pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                                    if (debug) console.log(pgm2 + 'Using group_debug_seq ' + group_debug_seq + ' for this waiting_for_file message') ;
                                    request = {
                                        msgtype: 'waiting_for_file',
                                        filename: filename
                                    } ;
                                    if (debug) console.log(pgm2 + 'sending waiting_for_file notification to other wallet. request = ' + JSON.stringify(request)) ;
                                    encryptions = [1,2,3] ;
                                    if (!encrypt.other_session_pubkey || !encrypt.other_session_pubkey2) encryptions = [3] ; // pubkeys message from other wallet is still missing. maybe this file
                                    encrypt.send_message(request, {optional: null, group_debug_seq: group_debug_seq, encryptions: encryptions}, function (response) {
                                        var pgm = module + '.message_demon.step_1_fileget.waiting_for_file send_message callback 1: ';
                                        var error ;
                                        pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                                        if (!response || response.error) {
                                            error = 'failed to send waiting_for_file message. response = ' + JSON.stringify(response) ;
                                            console.log(pgm2 + error) ;
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                            return ;
                                        }
                                        if (waiting_for_file_publish) {
                                            // publish callback code injected from wallet site. for example retry after failed publish
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                            waiting_for_file_publish() ;
                                        }
                                        else {
                                            // using MoneyNetworkAPILib sitePublish code. No retry after failed publish
                                            inner_path = encrypt.this_user_path + 'content.json' ;
                                            z_site_publish({inner_path: inner_path, encrypt: encrypt, group_debug_seq: group_debug_seq}, function (response) {
                                                var pgm = module + '.message_demon.step_1_fileget.waiting_for_file z_site_publish callback 2: ';
                                                pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                                                if (debug) console.log(pgm2 + 'response = ' + JSON.stringify(response));
                                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                            }) ;
                                        }
                                    }) ; // send_message
                                } ; // waiting_for_file
                                options.waiting_for_file = waiting_for_file ;
                            } // if
                        } // if
                        if (debug) console.log(pgm2 + 'Using group_debug_seq ' + group_debug_seq + ' for this incoming message') ;
                        options.group_debug_seq = group_debug_seq ;
                        z_file_get(pgm, options, function (json_str, extra) {
                            var pgm = module + '.message_demon.step_1_fileget z_file_get callback 2: ';
                            var pgm2, encrypted_json ;
                            pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                            if (!extra) extra = {} ;
                            extra.db_query_at = now ;
                            extra.group_debug_seq = group_debug_seq ;
                            if (!json_str) {
                                // timeout or deleted file. continue anyway.
                                console.log(pgm2 + 'timeout or file not found. extra = ' + JSON.stringify(extra)) ;
                                return step_3_run_cb(extra, null, null) ;
                            }
                            extra.fileget_at = new Date().getTime();
                            try {
                                encrypted_json = JSON.parse(json_str) ;
                            }
                            catch (e) {
                                console.log(pgm2 + inner_path + ' is invalid. json_str = ' + json_str + ', error = ' + e.message) ;
                                return step_3_run_cb(extra, json_str, null) ;
                            }
                            step_2_decrypt(extra, encrypted_json) ;
                        }) ; // z_file_get callback 2
                    }) ; // get_session_filenames callback 1
                } ; // step_1_fileget
                // start callback chain step 1-3
                step_1_fileget() ;
                // done
                done[filename] = true;
                // prevent mutating variables in loop. only one incoming message for each demon loop = one message every 500 ms
                break ;
            } // for i

        }); // dbQuery callback

    } // message_demon


    // symmetric encrypt/decrypt helpers
    function aes_encrypt(text, password) {
        var output_wa;
        output_wa = CryptoJS.AES.encrypt(text, password, {format: CryptoJS.format.OpenSSL}); //, { mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.AnsiX923, format: CryptoJS.format.OpenSSL });
        return output_wa.toString(CryptoJS.format.OpenSSL);
    } // aes_encrypt
    function aes_decrypt(text, password) {
        var output_wa;
        output_wa = CryptoJS.AES.decrypt(text, password, {format: CryptoJS.format.OpenSSL}); // , { mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.AnsiX923, format: CryptoJS.format.OpenSSL });
        return output_wa.toString(CryptoJS.enc.Utf8);
    } // aes_decrypt

    // Json schemas for json validation of ingoing and outgoing MoneyNetworkAPI messages
    var json_schemas = {
        wallet: {},
        mn: {},
        api: {

            "pubkeys": {
                "type": 'object',
                "title": 'Send pubkeys (JSEncrypt and cryptMessage) to other session',
                "description": 'MoneyNetwork: sends unencrypted pubkeys message to Wallet without a session password. Wallet: returns an encrypted pubkeys message to MoneyNetwork including a session password. pubkey is public key from JSEncrypt. pubkey2 is public key from cryptMessage. Password used for session restore. See get_password and password messages',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^pubkeys$'},
                    "pubkey": {"type": 'string'},
                    "pubkey2": {"type": 'string'},
                    "password": {"type": 'string'}
                },
                "required": ['msgtype', 'pubkey', 'pubkey2'],
                "additionalProperties": false
            }, // pubkeys

            "save_data": {
                "type": 'object',
                "title": 'Wallet: Save encrypted wallet data in MoneyNetwork',
                "description": "Optional message. Can be used to save encrypted data in an {key:value} object in MoneyNetwork localStorage.",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^save_data$'},
                    "data": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "key": {"type": 'string'},
                                "value": {"type": 'string'}
                            },
                            "required": ['key'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'data'],
                "additionalProperties": false
            }, // save_data

            "get_data": {
                "type": 'object',
                "title": 'Wallet: Get encrypted data from MoneyNetwork',
                "description": "Optional message. Can be used to request encrypted wallet data from MoneyNetwork localStorage",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^get_data$'},
                    "keys": {
                        "type": 'array',
                        "items": {"type": 'string'},
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'keys'],
                "additionalProperties": false
            }, // get_data

            "data": {
                "type": 'object',
                "title": 'MoneyNetwork: get_data response to with requested encrypted wallet data',
                "description": "Optional message. Return requested encrypted data to wallet",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^data$'},
                    "data": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "key": {"type": 'string'},
                                "value": {"type": 'string'}
                            },
                            "required": ['key'],
                            "additionalProperties": false
                        }
                    }
                }
            }, // data

            "delete_data": {
                "type": 'object',
                "title": 'Wallet: Delete encrypted data saved in MoneyNetwork',
                "description": "Optional message. Delete encrypted wallet data from MoneyNetwork localStorage. No keys property = delete all data",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^delete_data$'},
                    "keys": {
                        "type": 'array',
                        "items": {"type": 'string'},
                        "minItems": 1
                    }
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // delete_data

            "get_password": {
                "type": 'object',
                "title": 'Wallet: Restore old session. Request pwd2 from MN',
                "description": 'Pwd2 was sent to MN in first pubkeys message. Session restore. Unlock and return pwd2 to wallet session',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^get_password$'},
                    "pubkey": {"type": 'string'},
                    "pubkey2": {"type": 'string'},
                    "unlock_pwd2": {"type": 'string'}
                },
                "required": ["msgtype", "pubkey", "pubkey2", "unlock_pwd2"],
                "additionalProperties": false
            }, // get_password

            "password": {
                "type": 'object',
                "title": 'MN: Restore old session. Return unlocked password pwd2 to wallet session',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^password$'},
                    "password": {"type": 'string'}
                },
                "required": ["msgtype", "password"],
                "additionalProperties": false
            }, // password

            "response": {
                "type": 'object',
                "title": 'Generic response with an optional error message/code',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^response$'},
                    "error": {"type": 'string'}
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // response

            "ping": {
                "type": 'object',
                "title": 'Simple session ping. Expects Timeout or OK response',
                "description": 'Permissions=true: request permissions info in ping response (open_wallet, request_balance etc)',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^ping$'},
                    "permissions": {"type": 'boolean'}
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // ping

            "get_balance": {
                "type": 'object',
                "title": 'MN: send get_balance request to wallet session',
                "description": 'Wallet session must return a balance (OK) or response (error) message. Boolean flags: Open and/or close wallet before/after get_balance request',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^get_balance$'},
                    "open_wallet": {"type": 'boolean'},
                    "close_wallet": {"type": 'boolean'}
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // get_balance

            "balance": {
                "type": 'object',
                "title": 'Wallet: response. return balance info to MN',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^balance$'},
                    "balance": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "amount": {"type": 'number'}
                            },
                            "required": ['code', 'amount'],
                            "additionalProperties": false
                        }
                    },
                    "balance_at": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'balance', 'balance_at'],
                "additionalProperties": false
            }, // balance

            "wallet": {
                "type": 'object',
                "title": 'Public wallet information in wallet.json files',
                "description": 'wallet_* fields from site_info. currencies is a list of supported currencies, api_url is optional url to external API documentation and hub is a random wallet data hub address. wallet_sha256 is sha256 signature for {wallet_address, wallet_domain, wallet_title, wallet_description, currencies, api_url} hash',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^wallet$'},
                    "wallet_address": {"type": 'string'},
                    "wallet_domain": {"type": 'string'},
                    "wallet_title": {"type": 'string'},
                    "wallet_description": {"type": 'string'},
                    "currencies": {
                        "type": 'array',
                        "description": 'List of supported currencies. code is a (pseudo) currency iso code, short currency name, optional currency description (text), optional URL with currency information, optional fee information (text) and optional list with currency units',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "name": {"type": 'string'},
                                "description": {"type": 'string'},
                                "url": {"type": 'string'},
                                "fee_info": {"type": 'string'},
                                "units": {
                                    "type": 'array',
                                    "description": 'Optional unit list. For example units: [{ unit: BitCoin, factor: 1 },{ unit: Satoshi, factor: 0.00000001 }]',
                                    "items": {
                                        "type": 'object',
                                        "properties": {
                                            "unit": {"type": 'string'},
                                            "factor": {"type": 'number'}
                                        },
                                        "required": ['unit', 'factor'],
                                        "additionalProperties": false
                                    },
                                    "minItems": 1
                                }
                            },
                            "required": ['code', 'name'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    },
                    "api_url": {"type": 'string'},
                    "wallet_sha256": {"type": 'string', "pattern": '^[0-9a-f]{64}$'},
                    "hub": {"type": 'string'},
                    "json_schemas": {
                        "type": 'object',
                        "description": 'Extra json schema definitions used in wallet to wallet communication. Used in compatibility check between different wallet sites (different wallet sites supporting identical currencies)'
                    },
                    "message_workflow": {
                        "type": 'object',
                        "description": 'Json message workflow for extra schemas in wallet communication. Used in compatibility check between two different wallet sites (different wallet sites supporting identical currencies)'
                    }
                },
                "required": ['msgtype', 'wallet_sha256'],
                "additionalProperties": false
            }, // wallet

            // money transactions step 1: validate and optional return some json to be included in chat msg with money transactions. return prepare_mt_response or error response
            "prepare_mt_request": {
                "type": 'object',
                "title": 'Validate money transactions before send chat message with money transactions',
                "description": 'MN: validate money transactions in wallet session before send chat message to contact. Multiple money transactions are allowed. Money_transactionid. Wallet must return error message or json with transaction details for each money transaction',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^prepare_mt_request$'},
                    "contact": {
                        "description": 'Info about receiver of chat message / money transactions request. auth_address is the actual contact id and should be unique. alias and cert_user_id are human text info only and are not unique / secure contact info',
                        "type": 'object',
                        "properties": {
                            "alias": { "type": 'string'},
                            "cert_user_id": { "type": 'string'},
                            "auth_address": { "type": 'string'}
                        },
                        "required": ['alias', 'cert_user_id', 'auth_address'],
                        "additionalProperties": false
                    },
                    "open_wallet": {"type": 'boolean', "description": 'Open wallet before prepare_mt_request?'},
                    "close_wallet": {"type": 'boolean', "description": 'Close wallet after prepare_mt_request?'},
                    "money_transactions": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "action": { "type": 'string', "pattern": '^(Send|Request)$'},
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "amount": {"type": 'number'}
                            },
                            "required": ['action', 'code', 'amount'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    },
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Transaction id or session id. Random string. Unique for this money transaction chat message. Shared between 2 MN sessions and 2 wallet sessions'}
                },
                "required": ['msgtype', 'contact', 'money_transactions', 'money_transactionid'],
                "additionalProperties": false
            }, // prepare_mt_request

            "prepare_mt_response": {
                "type": 'object',
                "title": 'prepare_mt_request response',
                "description": 'array with json to be included in chat message to contact. One json for each money transaction in prepare_mt_request',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^prepare_mt_response$'},
                    "jsons": {
                        "type": 'array',
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'jsons'],
                "additionalProperties": false
            }, // prepare_mt_response

            // money transaction step 2: tell wallet session that chat msg with money transactions has been sent to receiver
            "send_mt": {
                "type": 'object',
                "title": 'Send money transaction(s) to receiver',
                "description": 'MN: tell wallet session that money transactions chat message has been send to receiver. wallet must prepare for wallet to wallet communication',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^send_mt$'},
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Same money_transactionid as in prepare_mt_request'}
                },
                "required": ['msgtype', 'money_transactionid'],
                "additionalProperties": false
            }, // send_mt

            // money transactions step 3: validate received money transactions. return OK response or error response
            "check_mt": {
                "type": 'object',
                "title": 'check money transactions received from contact in chat message',
                "description": 'See prepare_mt_request and prepare_mt_response for details.',
                "properties": {
                    "msgtype": { "type": 'string', "pattern": '^check_mt$'},
                    "contact": {
                        "description": 'Info about sender of chat message / money transactions request. auth_address is the actual contact id and should be unique. alias and cert_user_id are human text info only and are not unique / secure contact info',
                        "type": 'object',
                        "properties": {
                            "alias": { "type": 'string'},
                            "cert_user_id": { "type": 'string'},
                            "auth_address": { "type": 'string'}
                        },
                        "required": ['alias', 'cert_user_id', 'auth_address'],
                        "additionalProperties": false
                    },
                    "open_wallet": {"type": 'boolean'},
                    "close_wallet": {"type": 'boolean'},
                    "money_transactions": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "action": { "type": 'string', "pattern": '^(Send|Request)$'},
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "amount": {"type": 'number'},
                                "json": {}
                            },
                            "required": ['action', 'code', 'amount', 'json'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    },
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Same money_transactionid as in prepare_mt_request and send_mt'}
                },
                "required": ['msgtype', 'contact', 'money_transactions', 'money_transactionid'],
                "additionalProperties": false
            }, // check_mt

            // money transactions step 4: all validation OK. start actual money transaction(s) (wallet to wallet)
            "start_mt": {
                "type": 'object',
                "title": 'Start money transaction(s)',
                "description": 'MN: tell wallet session(s) to execute money transactions received in check_mt request',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^start_mt$'},
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Same money_transactionid as in check_mt_request'}
                },
                "required": ['msgtype', 'money_transactionid'],
                "additionalProperties": false
            }, // start_mt

            // publish sync. between MN and wallet sessions. minimum interval between publish is 16 seconds. MN session manages publish queue.
            "queue_publish": {
                "type": 'object',
                "title": 'Wallet: Ask MoneyNetwork to add publish request in publish queue',
                "description": 'Wallet session places cb in queue and sends unique cb_id to MoneyNetwork. Short timeout (5 seconds). Wallet session expects OK or timeout. Timeout: continue with publish. OK: wait for start_publish message',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^queue_publish$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id'],
                "additionalProperties": false
            }, // publish_started

            "start_publish": {
                "type": 'object',
                "title": 'MoneyNetwork: Tell wallet session to start publish',
                "description": 'Use cb_id to force a new publish. Ratelimit error in last wallet publish',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^start_publish$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id'],
                "additionalProperties": false
            }, // start_published

            "check_publish": {
                "type": 'object',
                "title": 'MoneyNetwork. Asking wallet if publish started with start_publish is still running',
                "description": 'For example after 30 seconds wait. Maybe a lost message or a JS error has prevented wallet session from reporting back to MoneyNetwork',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^check_publish$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id'],
                "additionalProperties": false
            }, // check_publish

            "published": {
                "type": 'object',
                "title": 'Wallet: publish done. Send publish result and timestamp for last OK publish to MN',
                "description": 'get_publish_response. Also used after OK or failed publish',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^published$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0},
                    "res": {"type": 'string'},
                    "last_published_at": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id', 'res', 'last_published_at'],
                "additionalProperties": false

            }, // published

            "notification" : {
                "type": 'object',
                "title": 'MN/Wallet. Send notification, see wrapperNotification, to other session',
                "description": 'For example: wallet session is waiting for user confirmation (money transfer)',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^notification$'},
                    "type": { "type": 'string', "pattern": '^(info|error|done)$'},
                    "message": { "type": 'string'},
                    "timeout": { "type": 'number'}
                },
                "required": ['msgtype', 'type', 'message'],
                "additionalProperties": false
            }, // notification

            "confirm" : {
                "type": 'object',
                "title": 'MN/Wallet. send confirm request, see wrapperConfirm, to other session',
                "description": 'For example: MoneyNetworkW2: confirm money transfer. OK response or timeout',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^confirm$'},
                    "message": { "type": 'string'},
                    "button_caption": { "type": 'string'}
                },
                "required": ['msgtype', 'message'],
                "additionalProperties": false
            }, // confirm

            "timeout": {
                "type": 'object',
                "title": 'MN/Wallet. Timeout message with notification and old processing information',
                "description": 'Sending process must adjust timeout in requests to avoid timeout',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^timeout$'},
                    "notification": {
                        "type": 'object',
                        "properties": {
                            "type": { "type": 'string'},
                            "message": { "type": 'string'},
                            "timeout": { "type": 'number'}
                        },
                        "required": ['msgtype', 'message'],
                        "additionalProperties": false
                    },
                    "stat": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "filename": { "type": 'string'},
                                "msgtype": {"type": 'string'},
                                "start_at": {"type": 'number', "multipleOf": 1.0},
                                "finish_at": {"type": 'number', "multipleOf": 1.0}
                            },
                            "required": ['filename', 'msgtype', 'start_at', 'finish_at'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'stat'],
                "additionalProperties": false
            }, // timeout

            "waiting_for_file": {
                "type": 'object',
                "title": 'Wallet/wallet: fileGet operation i hanging. Waiting for a optional file',
                "description": 'See z_file_get.timeout_count. problem with closed/open ZeroNet port. fallback to normal file in money transaction',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^waiting_for_file$'},
                    "filename": { "type": 'string'}
                },
                "required": ['msgtype', 'filename'],
                "additionalProperties": false
            }

        } // api

    } ; // json_schemas

    // inject extra json schemas. For example schemas used internally in MN or internally in wallets
    // subsystem: mn, wallet or whatever.
    function add_json_schemas (extra_json_schemas, subsystem) {
        var pgm = module + '.add_json_schemas: ' ;
        var key ;
        if (!subsystem) subsystem = 'wallet' ;
        if ((typeof subsystem != 'string') || (subsystem == 'api')) {
            console.log(pgm + 'error. invalid call. second parameter subsystem must be a string <> api. setting subsystem to wallet') ;
            subsystem = 'wallet' ;
        }
        if (!json_schemas[subsystem]) json_schemas[subsystem] = {} ;
        for (key in extra_json_schemas) {
            json_schemas[subsystem][key] = JSON.parse(JSON.stringify(extra_json_schemas[key])) ;
        }
    }

    // json validation. find "subsystem" for json schema (json.msgtype)
    // start with extra injected json schemas (wallets). end with core systems (mn and api)
    function get_subsystem (msgtype) {
        var key ;
        if (json_schemas['wallet'][msgtype]) return 'wallet' ;
        // try other non api and mn subsystem names (w2, wallet2 etc)
        for (key in json_schemas) {
            if (['api', 'mn'].indexOf(key) != -1) continue ;
            if (json_schemas[key][msgtype]) return key ;
        }
        // check core system (mn and api)
        if (json_schemas['mn'][msgtype]) return 'mn' ;
        else return 'api' ;
    } // get_subsystem

    // validate json before encrypt & send and after receive & decrypt using https://github.com/geraintluff/tv4
    // json messages between MoneyNetwork and MoneyNetwork wallet must be valid
    // params:
    // - calling_pgm: calling function. for debug messages
    // - json: request or response
    // - request_msgtype: request: null, response: request.msgtype
    // - subsystem (json schema definitions): calling subsystem (api, mn, wallet etc). null: search 1) wallet, 2) default is wallet
    function validate_json(calling_pgm, json, request_msgtype, subsystem) {
        var pgm = module + '.validate_json: ';
        var json_schema, json_error, key;
        if (!json || !json.msgtype) return 'required msgtype is missing in json message (parameter 2)';
        // check/search json schema definition
        if (subsystem && (typeof subsystem != 'string')) return 'Invalid subsystem parameter 4. Must be a string (api, mn, wallet, etc)' ;
        if (!subsystem) subsystem = get_subsystem((json.msgtype)) ;
        // check json schema
        json_schema = json_schemas[subsystem][json.msgtype];
        if (!json_schema) return 'Unknown msgtype ' + json.msgtype + ' (subsystem = ' + subsystem + ')';
        if (request_msgtype && (json.msgtype != 'response')) {
            // validate request => response combinations
            if (request_msgtype == 'response') return 'Invalid request msgtype ' + request_msgtype;
            if (!json_schemas[subsystem][request_msgtype]) return 'Unknown request msgtype ' + request_msgtype;
            if ((request_msgtype == 'pubkeys') && (json.msgtype == 'pubkeys')) null; // OK combination
            else if ((request_msgtype == 'get_data') && (json.msgtype == 'data')) null; // OK combination
            else if ((request_msgtype == 'get_password') && (json.msgtype == 'password')) null; // OK combination
            else if ((request_msgtype == 'get_balance') && (json.msgtype == 'balance')) null; // OK combination
            else if ((request_msgtype == 'prepare_mt_request') && (json.msgtype == 'prepare_mt_response')) null; // OK combination
            else if ((request_msgtype == 'get_published') && (json.msgtype == 'published')) null; // OK combination
            else if ((request_msgtype == 'queue_publish') && (json.msgtype == 'start_publish')) null; // OK combination
            else return 'Invalid ' + request_msgtype + ' request ' + json.msgtype + ' response combination';
        }
        if (typeof tv4 === 'undefined') {
            if (debug) console.log(pgm + 'warning. skipping ' + json.msgtype + ' json validation. tv4 is not defined');
            return;
        }
        // validate json
        if (tv4.validate(json, json_schema, pgm)) return null; // json is OK
        // report json error
        json_error = JSON.parse(JSON.stringify(tv4.error));
        delete json_error.stack;
        console.log(pgm + 'json_error = ', json_error) ;
        return 'Error in ' + json.msgtype + ' JSON. ' + JSON.stringify(json_error);
    } // validate_json

    // helper. calculate wallet_sha256 from other fields in wallet.json (minimize wallet.json disk usage)
    // wallet must be valid json (see validate_json). return null if doublet code or doublet units
    var pseudo_wallet_sha256 = '0000000000000000000000000000000000000000000000000000000000000000' ;
    function calc_wallet_sha256 (wallet) {
        var pgm = module + '.calc_wallet_sha256: ';
        var new_wallet, wallet_sha256, i, codes, currency, new_currency, j, unit, units, pseudo_wallet_sha256_added ;
        if (!wallet.wallet_sha256) {
            wallet.wallet_sha256 = pseudo_wallet_sha256 ;
            pseudo_wallet_sha256_added = true ;
        }
        if (validate_json(pgm, wallet, null, 'api')) {
            // wallet is invalid. abort wallet_sha256 calc
            if (pseudo_wallet_sha256_added) delete wallet.wallet_sha256 ;
            return null ;
        }
        if (pseudo_wallet_sha256_added) delete wallet.wallet_sha256 ;
        // todo: any need for "normalize" wallet structure any longer?
        // normalize currencies list. sort and fixed order of properties. see wallet schema definition
        new_wallet = {
            wallet_address: wallet.wallet_address,
            wallet_domain: wallet.wallet_domain,
            wallet_title: wallet.wallet_title,
            wallet_description: wallet.wallet_description,
            currencies: [],
            api_url: wallet.api_url,
            json_schemas: wallet.json_schemas, // no normalize
            message_workflow: wallet.message_workflow // no normalize
        } ;
        codes = [] ;
        for (i=0 ; i<wallet.currencies.length ; i++) {
            // check doublet currency code
            currency = wallet.currencies[i] ;
            if (codes.indexOf(currency.code) != -1) {
                console.log(pgm + 'doublet currency code ' + currency.code + ' in wallet ' + JSON.stringify(wallet)) ;
                return null ;
            }
            codes.push(currency.code) ;
            // insert normalized currency into currencies array
            new_currency = {
                code: currency.code,
                name: currency.name,
                description: currency.description,
                url: currency.url,
                fee_info: currency.fee_info,
                units: currency.units ? [] : null
            } ;
            new_wallet.currencies.push(new_currency) ;
            if (!currency.units) continue ;
            // add units to currency
            units = [] ;
            for (j=0 ; j<currency.units.length ; j++) {
                unit = currency.units[j] ;
                // check doublet unit code
                if (units.indexOf(unit.unit) != -1) {
                    console.log(pgm + 'doublet unit ' + unit.unit + ' in wallet ' + JSON.stringify(wallet)) ;
                    return null ;
                }
                units.push(unit.unit) ;
                // insert normalized unit into units array
                new_currency.units.push({ unit: unit.unit, factor: unit.factor }) ;
            } // for j
            // sort units array
            new_currency.units.sort(function(a,b) { return b.unit > a.unit ? 1 : -1 }) ;
        } // for i
        // sort currencies array
        new_wallet.currencies.sort(function (a,b) { return b.code > a.code ? 1 : -1 }) ;
        // to json + sha256
        wallet_sha256 = CryptoJS.SHA256(JSON.stringify(new_wallet)).toString();
        return wallet_sha256 ;
    } // calc_wallet_sha256

    // helper. get wallet info from sha256 value (minimize wallet.json disk usage)
    // param:
    // - wallet_sha256. sha256 string or array with sha256 strings
    // - cb. callback. return hash with full wallet info for each wallet_sha256 + refresh_ui = true/false
    var wallet_info_cache = {} ; // sha256 => wallet_info
    function get_wallet_info (wallet_sha256, cb) {
        var pgm = module + '.get_wallet_info: ';
        var i, re, results, api_query_3, sha256, debug_seq, refresh_angular_ui ;
        refresh_angular_ui = false ;
        if (!wallet_sha256) return cb({error: 'invalid call. param 1 must be a string or an array of strings'}) ;
        if (typeof wallet_sha256 == 'string') wallet_sha256 = [wallet_sha256] ;
        if (!Array.isArray(wallet_sha256)) return cb({error: 'invalid call. param 1 must be a string or an array of strings'}) ;
        re = new RegExp('^[0-9a-f]{64}$') ;
        for (i=0 ; i<wallet_sha256.length ; i++) {
            if (typeof wallet_sha256[i] != 'string') return cb({error: 'invalid call. param 1 must be a string or an array of strings'}) ;
            if (!wallet_sha256[i].match(re)) return cb({error: 'invalid call. param 1 must be a sha256 string value or an array of sha256 string values'}) ;
        }
        if (typeof cb != 'function') return cb({error: 'invalid call. param 2 must be a callback function'});
        if (!ZeroFrame) cb({error: 'invalid call. ZeroFrame is missing. Please use ' + module + '.init({ZeroFrame:xxx}) to inject ZeroFrame API into this library'});

        results = {} ; // sha256 => wallet_info
        if (!wallet_sha256.length) return cb(results,refresh_angular_ui) ;

        // check cache
        for (i=wallet_sha256.length-1 ; i>=0 ; i--) {
            sha256 = wallet_sha256[i] ;
            if (!wallet_info_cache[sha256]) continue ; // not in cache
            // found in cache
            results[sha256] = JSON.parse(JSON.stringify(wallet_info_cache[sha256])) ;
            wallet_sha256.splice(i,1) ;
        }
        if (!wallet_sha256.length) return cb(results, refresh_angular_ui) ; // all sha256 values were found in cache

        // find wallets with full wallet info for the missing wallet_sha256 values
        api_query_3 =
            "select  wallet_sha256.value as wallet_sha256, json.directory " +
            "from keyvalue as wallet_sha256, keyvalue, json " +
            "where wallet_sha256.key = 'wallet_sha256' " +
            "and wallet_sha256.value in " ;
        for (i=0 ; i<wallet_sha256.length ; i++) {
            api_query_3 += i==0 ? '(' : ',' ;
            api_query_3 += " '" + wallet_sha256[i] + "'" ;
        }
        api_query_3 +=
            ") and keyvalue.json_id = wallet_sha256.json_id " +
            "and keyvalue.value is not null " +
            "and keyvalue.key like 'wallet_%' " +
            "and json.json_id = keyvalue.json_id " +
            "group by  wallet_sha256.value, keyvalue.json_id " +
            "having count(*) >= 4" ;
        if (debug) console.log(pgm + 'api query 3 = ' + api_query_3);

        debug_seq = debug_z_api_operation_start(pgm, 'api query 3', 'dbQuery') ;
        ZeroFrame.cmd("dbQuery", [api_query_3], function (wallets) {
            var pgm = module + '.get_wallet_info dbQuery callback: ' ;
            var error, check_wallet ;
            debug_z_api_operation_end(debug_seq, !wallets || wallets.error ? 'Failed' : 'OK') ;
            refresh_angular_ui = true ;
            if (wallets.error) {
                error = 'failed to find full wallet information. error = ' + wallets.error ;
                console.log(pgm + error);
                console.log(pgm + 'query = ' + api_query_3);
                return cb({error: error});
            }
            if (!wallets.length) {
                error = 'could not find any wallet.json with full wallet info for wallet_sha256 in ' + JSON.stringify(wallet_sha256) ;
                console.log(pgm + error);
                console.log(pgm + 'query = ' + api_query_3);
                return cb({error: error});
            }
            console.log(pgm + 'wallets = ' + JSON.stringify(wallets)) ;

            // lookup and check wallets one by one. One fileGet for each wallet.json file
            check_wallet = function () {
                var pgm = module + '.get_wallet_info.check_wallet: ' ;
                var row, inner_path, debug_seq ;
                row = wallets.shift() ;
                if (!row) return cb(results, refresh_angular_ui) ; // done
                if (results[row.wallet_sha256]) return check_wallet() ; // wallet info is already found for this sha256 value
                // check wallet.json file
                inner_path = 'merged-' + get_merged_type() + '/' + row.directory + '/wallet.json' ;
                debug_seq = debug_z_api_operation_start(pgm, inner_path, 'fileGet');
                ZeroFrame.cmd("fileGet", {inner_path: inner_path, required: false}, function (wallet_str) {
                    var pgm = module + '.get_wallet_info.check_wallet fileGet callback: ' ;
                    var wallet, error, calculated_sha256 ;
                    debug_z_api_operation_end(debug_seq, wallet_str ? 'OK' : 'Not found') ;
                    if (!wallet_str) {
                        console.log(pgm + 'wallet.json was not found. inner_path = ' + inner_path);
                        return check_wallet(); // next wallet
                    }
                    try {
                        wallet = JSON.parse(wallet_str);
                    }
                    catch (e) {
                        console.log(pgm + 'wallet.json is invalid. inner_path = ' + inner_path + '. error = ' + e.message);
                        return check_wallet(); // next wallet
                    }
                    console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                    //wallet = {
                    //    "msgtype": "wallet",
                    //    "wallet_address": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                    //    "wallet_title": "MoneyNetworkW2",
                    //    "wallet_description": "Money Network - Wallet 2 - BitCoins www.blocktrail.com - runner jro",
                    //    "currencies": [{
                    //        "code": "tBTC",
                    //        "name": "Test Bitcoin",
                    //        "url": "https://en.bitcoin.it/wiki/Testnet",
                    //        "units": [{"unit": "BitCoin", "factor": 1}, {"unit": "Satoshi", "factor": 1e-8}]
                    //    }],
                    //    "hub": "1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ",
                    //    "wallet_sha256": "6ef0247021e81ae7ae1867a685f0e84cdb8a61838dc25656c4ee94e4f20acb74"
                    //};
                    // validate wallet.json after read
                    error = validate_json(pgm, wallet, null, 'api') ;
                    if (error) {
                        console.log(pgm + 'wallet.json was found but is invalid. error = ' + error + ', wallet = ' + JSON.stringify(wallet));
                        return check_wallet(); // next wallet
                    }
                    // check wallet_sha256
                    // full wallet info. test wallet_sha256 signature
                    calculated_sha256 = calc_wallet_sha256(wallet);
                    if (!calculated_sha256) {
                        console.log(pgm + 'wallet.json was found but is invalid. wallet_sha256 could not be calculated, wallet = ' + JSON.stringify(wallet));
                        return check_wallet() ; // next wallet
                    }
                    if (calculated_sha256 != wallet.wallet_sha256) {
                        console.log(pgm + 'wallet.json was found but is invalid. expected calculated_sha256 = ' + calculated_sha256 + '. found wallet.wallet_sha256 = ' + wallet.wallet_sha256 + ', wallet = ' + JSON.stringify(wallet));
                        return check_wallet() ; // next wallet
                    }
                    // OK. save wallet info.
                    results[row.wallet_sha256] = {
                        wallet_address: wallet.wallet_address,
                        wallet_domain: wallet.wallet_domain,
                        wallet_title: wallet.wallet_title,
                        wallet_description: wallet.wallet_description,
                        currencies: wallet.currencies,
                        api_url: wallet.api_url,
                        wallet_sha256: row.wallet_sha256
                    } ;
                    wallet_info_cache[row.wallet_sha256] = JSON.parse(JSON.stringify(results[row.wallet_sha256])) ;
                    // next wallet
                    check_wallet() ;
                }) ; // fileGet callback

            } ; // check_wallet
            // start loop
            check_wallet() ;

        }) ; // dbQuery callback 1

    } // get_wallet_info

    // ZeroFrame wrappers:
    // - mergerSiteAdd
    // - fileGet
    // - fileWrite
    // - sitePublish
    var new_hub_file_get_cbs = {} ; // any fileGet callback waiting for hub to be ready?
    function z_merger_site_add (hub, cb) {
        var pgm = module + '.z_merger_site_add: ' ;
        ZeroFrame.cmd("mergerSiteAdd", [hub], function (res) {
            var pgm = module + '.z_merger_site_add mergerSiteAdd callback: ' ;
            console.log(pgm + 'res = '+ JSON.stringify(res));
            if (res == 'ok') {
                console.log(pgm + 'new hub ' + hub + ' was added. hub must be ready. wait for jsons (dbQuery) before first fileGet request to new hub') ;
                if (!new_hub_file_get_cbs[my_user_hub]) new_hub_file_get_cbs[my_user_hub] = [] ; // fileGet callbacks waiting for mergerSiteAdd operation to finish
                // start demon process. waiting for new user data hub to be ready
                setTimeout(monitor_first_hub_event, 250) ;
            }
            cb(res) ;
        }) ; // mergerSiteAdd callback 3
    } // z_merger_site_add

    // demon. dbQuery. check for any json for new user data hub before running any fileGet operations
    function monitor_first_hub_event () {
        var pgm = module + '.monitor_first_hub_event: ' ;
        var api_query_4, debug_seq ;
        if (!Object.keys(new_hub_file_get_cbs).length) return ; // no new hubs to monitor

        api_query_4 =
            "select substr(directory, 1, instr(directory,'/')-1) as hub, count(*) as rows " +
            "from json " +
            "group by substr(directory, 1, instr(directory,'/')-1);" ;
        debug_seq = debug_z_api_operation_start(pgm, 'api query 4', 'dbQuery', show_debug('z_db_query')) ;
        ZeroFrame.cmd("dbQuery", [api_query_4], function (res) {
            var pgm = service + '.monitor_first_hub_event dbQuery callback: ';
            var hub, i, cbs, cb;
            // if (detected_client_log_out(pgm)) return ;
            debug_z_api_operation_end(debug_seq, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK');
            if (res.error) {
                console.log(pgm + "first hub lookup failed: " + res.error);
                console.log(pgm + 'query = ' + api_query_4);
                for (hub in new_hub_file_get_cbs) console.log(pgm + 'error: ' + new_hub_file_get_cbs[hub].length + ' callbacks are waiting forever for hub ' + hub) ;
                return ;
            }
            for (i=0 ; i<res.length ; i++) {
                hub = res[i].hub ;
                if (!new_hub_file_get_cbs[hub]) continue ;
                console.log(pgm + 'new user data hub ' + hub + ' is ready. ' + new_hub_file_get_cbs[hub].length + ' fileGet operations are waiting in callback queue. running callbacks now') ;
                // move to temporary cbs array
                cbs = [] ;
                while (new_hub_file_get_cbs[hub].length) {
                    cb = new_hub_file_get_cbs[hub].shift() ;
                    cbs.push(cb) ;
                }
                delete new_hub_file_get_cbs[hub] ;
                // run cbs
                while (cbs.length) {
                    cb = cbs.shift() ;
                    cb() ;
                }
            }
            setTimeout(monitor_first_hub_event, 250) ;
        }) ; // dbQuery callback

    } // monitor_first_hub_event

    // optional add group debug_seq to pgm. used in console.log
    // for example, group_debug_seq = 10
    // pgm = MoneyNetworkAPI.get_content_json:
    // pgm2 = MoneyNetworkAPI.get_content_json/10:
    function get_group_debug_seq_pgm(pgm, group_debug_seq) {
        var pos;
        if (!debug) return pgm;
        if (pgm.match(/\/[0-9]/)) return pgm; // already group_debug_seq in pgm
        if (!group_debug_seq) return pgm; // no group_debug_seq
        pos = pgm.lastIndexOf(':');
        if (pos == -1) return pgm + '/' + group_debug_seq + ': ';
        else return pgm.substr(0, pos) + '/' + group_debug_seq + pgm.substr(pos);
    } // get_group_debug_seq_pgm

    // - todo: add long running operation warning to debug_z_api_operation_pending
    // z_file_get: as fileGet operation + extensions:
    // - get optional file info for optional fileGet
    // - add required and timeout = 60 seconds for optional fileGet
    // - retry failed optional fileGet operations (retry_count)
    // - todo: send waiting_for_file notification to other wallet
    var inner_path_re1 = /data\/users\// ; // user directory?
    var inner_path_re2 = /^data\/users\// ; // invalid inner_path. old before merger-site syntax
    var inner_path_re3 = new RegExp('^merged-' + get_merged_type() + '\/(.*?)\/data\/users\/content\.json$') ; // extract hub
    var inner_path_re4 = new RegExp('^merged-' + get_merged_type() + '\/(.*?)\/data\/users\/(.*?)\/(.*?)$') ; // extract hub, auth_address and filename
    function z_file_get (pgm, options, cb) {
        var inner_path, match34, hub, is_optional_file, filename, get_optional_file_info, pgm2 ;

        // Check ZeroFrame
        if (!ZeroFrame) throw pgm + 'fileGet aborted. ZeroFrame is missing. Please use ' + module + '.init({ZeroFrame:xxx}) to inject ZeroFrame API into ' + module;

        inner_path = options.inner_path ;
        if (inner_path.match(inner_path_re1)) {
            // path to user directory.
            // check inner_path (old before merger site syntax data/users/<auth_address>/<filename>
            if (inner_path.match(inner_path_re2)) throw pgm + 'Invalid fileGet path. Not a merger-site path. inner_path = ' + inner_path ;
            // check new merger site syntax merged-MoneyNetwork/<hub>/data/users/<auth_address>/<filename>
            match34 = inner_path.match(inner_path_re3) || inner_path.match(inner_path_re4);
            if (match34) {
                // check hub
                hub = match34[1] ;
                if (new_hub_file_get_cbs[hub]) {
                    console.log(pgm + 'new hub ' + hub + '. waiting with fileGet request for ' + inner_path) ;
                    new_hub_file_get_cbs[hub].push(function() { z_file_get (pgm, options, cb) }) ;
                    return ;
                }
            }
            else throw pgm + 'Invalid fileGet path. Not a merger-site path. inner_path = ' + inner_path ;
        }

        // check if file is a normal or an optional files.
        // 1) user directory files - use dbQuery, files and files_optional tables
        // 2) outsize user directories - use fileList
        is_optional_file = function(cb) {
            var pgm = module + '.z_file_get.is_optional_file: ' ;
            var match4, directory, filename, api_query_6, debug_seq, pos ;
            pos = inner_path.lastIndexOf('/') ;
            filename = inner_path.substr(pos+1) ;
            if (filename == 'content.json') return cb(false) ;
            if (match4=inner_path.match(inner_path_re4)) {
                // 1: user directory file with hub, auth_address and filename. use files and files_optional tables
                directory = match4[1] + '/data/users/' + match4[2] ;
                api_query_6 =
                    "select 'n' as filetype from json, files " +
                    "where json.directory = '" + directory + "' " +
                    "and json.file_name = 'content.json' " +
                    "and files.json_id = json.json_id " +
                    "and files.filename = '" + filename + "' " +
                    "  union all " +
                    "select 'o' as filetype from json, files_optional " +
                    "where json.directory = '" + directory + "' " +
                    "and json.file_name = 'content.json' " +
                    "and files_optional.json_id = json.json_id " +
                    "and files_optional.filename = '" + filename + "'" ;
                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'api query 6', 'dbQuery', null, options.group_debug_seq);
                ZeroFrame.cmd("dbQuery", [api_query_6], function (res) {
                    var pgm = module + '.z_file_get.is_optional_file dbQuery callback: ';
                    var inner_path9, call_countdown_cb, countdown, wait_for_response_with_countdown;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, (!res || res.error) ? 'Failed' : 'OK');
                    if (res.error) throw pgm + '. dbQuery failed. ' + res.error;
                    if (!res.length) {
                        console.log(pgm + 'file ' + inner_path + ' has been deleted. Not in files or in files_optional. abort fileGet operation') ;
                        console.log(pgm + 'api_query_6 = ' + api_query_6) ;
                        return cb(true) ;
                    }
                    cb((res[0].filetype == 'o')) ;
                }); // dbQuery callback 1
                return ;
            }
            // not a user directory file. user fileList
            pos = inner_path.lastIndexOf('/') ;
            directory = inner_path.substr(0, pos) ;
            console.log(pgm + 'directory = ' + directory) ;
            ZeroFrame.cmd("fileList", [directory], function(files) {
                var pgm = module + '.z_file_get.is_optional_file fileList callback: ';
                console.log(pgm + 'inner_path = ' + inner_path + ', directory = ' + directory + ', files.length = ' + files.length + ', files = ' + JSON.stringify(files)) ;
                // asuming that not existing files are missing optional files (for example screendumps)
                cb((files.indexOf(filename) == -1)) ;
            }) ;
        } ; // is_optional_file
        is_optional_file(function(optional_file) {
            var extra ;
            extra = {optional_file: optional_file};

            if (options.hasOwnProperty('timeout_count')) {
                // special MN option. retry optional fileGet <timeout_count> times. First fileGet will often fail with timeout
                extra.timeout_count = options.timeout_count ;
                delete options.timeout_count ;
            }
            if (options.hasOwnProperty('group_debug_seq')) {
                // log option. add group debug seq to long serie of connected debug logs (send_message, process_incoming_message etc)
                extra.group_debug_seq = options.group_debug_seq ;
                delete options.group_debug_seq ;
            }
            if (options.hasOwnProperty('waiting_for_file')) {
                // after first timeout. send a waiting_for_file notification to other wallet session
                extra.waiting_for_file = options.waiting_for_file ;
                delete options.waiting_for_file ;
            }
            pgm2 = get_group_debug_seq_pgm(pgm, extra.group_debug_seq) ;
            if (debug) console.log(pgm2 + 'filename = ' + JSON.stringify(filename) + ', optional_file = ' + extra.optional_file) ;

            // optional step. get info about optional file before fileGet operation
            // "!file_info.is_downloaded && !file_info.peer" should be not downloaded optional files without any peers
            // but the information is not already correct. peer can be 0 and other client is ready to serve optional file.
            // try a fileGet with required and a "short" timeout
            get_optional_file_info = function (cb) {
                if (!extra.optional_file) return cb(null) ;
                ZeroFrame.cmd("optionalFileInfo", [inner_path], function (file_info) {
                    if (debug) console.log(pgm2 + 'file_info = ' + JSON.stringify(file_info)) ;
                    cb(file_info) ;
                }) ; // optionalFileInfo
            } ; // get_optional_file_info
            get_optional_file_info(function(file_info) {
                var cb2_done, cb2, cb2_timeout, timeout, process_id, debug_seq, warnings, old_options ;
                extra.file_info = file_info ;
                if (extra.optional_file && !file_info) {
                    if (debug) console.log(pgm2 + 'optional fileGet and no optional file info. must be a deleted optional file. abort fileGet operation') ;
                    return cb(null, extra) ;
                }
                if (extra.optional_file) {
                    // some additional checks and warnings.
                    if (!file_info) {
                        if (debug) console.log(pgm2 + 'optional fileGet and no optional file info. must be a deleted optional file. abort fileGet operation') ;
                        return cb(null, extra) ;
                    }
                    if (!file_info.is_downloaded && !file_info.peer) {
                        // not downloaded optional files and (maybe) no peers! peer information is not always correct
                        if (debug) console.log(pgm2 + 'warning. starting fileGet operation for optional file without any peers. file_info = ' + JSON.stringify(file_info)) ;
                        warnings = [] ;
                        old_options = JSON.stringify(options) ;
                        if (!options.required) {
                            options.required = true ;
                            warnings.push('added required=true to fileGet operation') ;
                        }
                        if (!options.timeout) {
                            options.timeout = 60 ;
                            warnings.push('added timeout=60 to fileGet operation') ;
                        }
                        if (warnings.length && debug) console.log(pgm2 + 'Warning: ' + warnings.join('. ') + '. old options = ' + old_options + ', new_options = ' + JSON.stringify(options)) ;
                    }
                }

                // extend cb. add ZeroNet API debug messages + timeout processing.
                // cb2 is run as fileGet callback or is run by setTimeout (sometimes problem with optional fileGet operation running forever)
                cb2_done = false ;
                cb2 = function (data, timeout) {
                    var options_clone ;
                    if (process_id) {
                        try {$timeout.cancel(process_id)}
                        catch (e) {}
                        process_id = null ;
                    }
                    if (cb2_done) return ; // cb2 has already run
                    cb2_done = true ;
                    if (timeout) extra.timeout = timeout ;
                    // MoneyNetworkHelper.debug_z_api_operation_end(debug_seq);
                    debug_z_api_operation_end(debug_seq, data ? 'OK' : 'Not found');

                    if (!data && extra.optional_file && extra.hasOwnProperty('timeout_count') && (extra.timeout_count > 0)) {
                        if (debug) console.log(pgm2 + inner_path + ' fileGet failed. timeout_count was ' + extra.timeout_count) ;
                        if (extra.waiting_for_file) {
                            // optional fileGet timeout and waiting_for_file callback has been injected into z_file_get (message_demon).
                            // send waiting_for_file notification and continue with normal fallback for failed fileGet.
                            // other wallet session may resend missing optional file as a normal file
                            extra.waiting_for_file() ;
                        }
                        if (extra.timeout_count > 0) {
                            // optional fileGet failed. called with a timeout_count. Retry operation
                            options_clone = JSON.parse(JSON.stringify(options)) ;
                            options_clone.timeout_count = extra.timeout_count ;
                            options_clone.timeout_count-- ;
                            if (debug) console.log(pgm2 + 'retrying ' + inner_path + ' fileGet with timeout_count = ' + options_clone.timeout_count) ;
                            options_clone.group_debug_seq = extra.group_debug_seq ;
                            z_file_get(pgm, options_clone, cb) ;
                            return ;
                        }
                    }
                    cb(data, extra) ;
                } ; // fileGet callback

                // force timeout after timeout || 60 seconds
                cb2_timeout = function () {
                    cb2(null, true) ;
                };
                timeout = options.timeout || 60 ; // timeout in seconds
                process_id = setTimeout(cb2_timeout, timeout*1000) ;

                // start fileGet
                debug_seq = debug_z_api_operation_start(pgm, inner_path, 'fileGet', null, extra.group_debug_seq) ;
                ZeroFrame.cmd("fileGet", options, cb2) ;

            }) ; // get_optional_file_info callback

        }) ;

    } // z_file_get

    // ZeroFrame fileWrite wrapper.
    // inner_path must be a merger site path
    // auth_address must be auth_address for current user
    // max one fileWrite process. Other fileWrite processes must wait (This file still in sync, if you write is now, then the previous content may be lost)
    var z_file_write_cbs = [] ; // callbacks waiting for other fileWrite to finish
    var z_file_write_running = false ;
    function z_file_write (pgm, inner_path, content, options, cb) {
        var match2, auth_address, this_file_write_cb, debug_seq, pgm2 ;
        if (!ZeroFrame) throw pgm + 'fileWrite aborted. ZeroFrame is missing. Please use ' + module + '.init({ZeroFrame:xxx}) to inject ZeroFrame API into ' + module;
        if (!inner_path || inner_path.match(inner_path_re2)) throw pgm + 'Invalid call. parameter 2 inner_parth is not a merger-site path. inner_path = ' + inner_path ;
        if (typeof cb != 'function') throw pgm + 'Invalid call. parameter 5 cb is not a callback function' ;
        if (!options) options = {} ;
        pgm2 = get_group_debug_seq_pgm(pgm, options.group_debug_seq) ;
        match2 = inner_path.match(inner_path_re4) ;
        if (match2) {
            auth_address = match2[2] ;
            if (!ZeroFrame.site_info) throw pgm + 'fileWrite aborted. ZeroFrame is not yet ready' ;
            if (!ZeroFrame.site_info.cert_user_id) throw pgm + 'fileWrite aborted. No ZeroNet certificate selected' ;
            if (auth_address != ZeroFrame.site_info.auth_address) {
                console.log(pgm2 + 'inner_path = ' + inner_path + ', auth_address = ' + auth_address + ', ZeroFrame.site_info.auth_address = ' + ZeroFrame.site_info.auth_address);
                throw pgm + 'fileWrite aborted. Writing to an invalid user directory.' ;
            }
        }
        else throw pgm + 'Invalid fileGet path. Not a merger-site path. inner_path = ' + inner_path ;

        if (z_file_write_running) {
            // wait for previous fileWrite process to finish
            z_file_write_cbs.push({inner_path: inner_path, content: content, cb: cb}) ;
            return ;
        }
        z_file_write_running = true ;

        // extend cb.
        this_file_write_cb = function(res) {
            var next_file_write_cb, run_cb ;
            z_file_write_running = false ;
            debug_z_api_operation_end(debug_seq, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
            run_cb = function () { cb(res)} ;
            setTimeout(run_cb, 0) ;
            // done with this fileWrite. Any other waiting fileWrite operations?
            if (!z_file_write_cbs.length) return ;
            next_file_write_cb = z_file_write_cbs.shift() ;
            z_file_write(pgm, next_file_write_cb.inner_path, next_file_write_cb.content, {}, next_file_write_cb.cb) ;
        }; // cb2

        debug_seq = debug_z_api_operation_start(pgm, inner_path, 'fileWrite', null, options.group_debug_seq) ;
        ZeroFrame.cmd("fileWrite", [inner_path, content], this_file_write_cb) ;
    } // z_file_write

    function z_file_delete (pgm, inner_path, cb) {
        var debug_seq1 ;
        // issue #1140. https://github.com/HelloZeroNet/ZeroNet/issues/1140
        // false Delete error: [Errno 2] No such file or directory error returned from fileDelete
        // step 1: check file before delete operation
        debug_seq1 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'fileGet');
        MoneyNetworkAPILib.z_file_get(pgm, {inner_path: inner_path, required: false, timeout: 1}, function (res1) {
            var debug_seq2;
            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq1, res1 ? 'OK' : 'Not found');
            if (!res1) return cb('Delete error: [Errno 2] No such file or directory');
            // step 2: fileDelete
            debug_seq2 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'fileDelete');
            ZeroFrame.cmd("fileDelete", inner_path, function (res2) {
                var debug_seq3;
                if ((res2 == 'ok') || (!res2.error.match(/No such file or directory/))) {
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, res2 == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res2));
                    return cb('ok') ;
                }
                // step 3: check file after fileDelete
                // fileDelete returned No such file or directory. Recheck that file has been deleted
                console.log(pgm + 'issue 1140. https://github.com/HelloZeroNet/ZeroNet/issues/1140. step 2 FileDelete returned No such file or directory');
                debug_seq3 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'fileGet');
                MoneyNetworkAPILib.z_file_get(pgm, {inner_path: inner_path, required: false, timeout: 1}, function (res3) {
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq3, res3 ? 'OK' : 'Not found');
                    if (!res3) {
                        // everything is fine. request file was deleted correct in step 2
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, 'OK');
                        return cb('ok') ;
                    }
                    else {
                        console.log(pgm + 'issue 1140. something is very wrong. first fileGet returned OK, fileDelete returned No such file or directory and last fileGet returned OK');
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, res2 == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res2));
                        return cb('#1140. https://github.com/HelloZeroNet/ZeroNet/issues/1140');
                    }
                }); // fileGet callback 3
            }); // fileDelete callback 1
        }); // fileGet callback 1
    } // z_file_delete

    // sitePublish. long running operation.
    // sitePublish must wait for previous publish to finish
    // sitePublish must wait for long running update transactions (write and delete) to finish before starting publish
    // long running update transactions must wait until publish has finished
    // use start_transaction and end_transaction
    var transactions = {} ; // timestamp => object with transaction info

    function start_transaction(calling_pgm, cb) {
        var pgm = module + '.start_transaction: ' ;
        var transaction_timestamp, key, running;
        if (typeof cb != 'function') throw pgm + 'start_transaction: invalid call. second parameter cb must be a callback function';

        transaction_timestamp = new Date().getTime();
        while (transactions[transaction_timestamp]) transaction_timestamp++;
        transactions[transaction_timestamp] = {
            pgm: calling_pgm,
            created_at: transaction_timestamp,
            cb: cb,
            running: false
        };
        console.log(pgm + 'added transaction with timestamp ' + transaction_timestamp + ' to transactions. calling_pgm = ' + calling_pgm) ;

        // any running transactions
        running = 0 ;
        for (key in transactions) {
            if (transactions[key].running) {
                // wait
                running++ ;
                console.log(pgm + 'pause ' + calling_pgm + '. ' + transactions[key].pgm + ' is running');
                return;
            }
        }
        if (running) return ;

        // start now
        transactions[transaction_timestamp].running = true;
        transactions[transaction_timestamp].started_at = transaction_timestamp;
        transactions[transaction_timestamp].cb(transaction_timestamp);
    } // start_transaction

    function end_transaction (transaction_timestamp) {
        var pgm = module + '.end_transaction: ' ;
        var now, waittime, elapsedtime, key ;
        if (!transactions[transaction_timestamp]) throw 'could not find any transaction with transaction_timestamp = ' + transaction_timestamp;
        now = new Date().getTime() ;
        transactions[transaction_timestamp].running = false ;
        transactions[transaction_timestamp].finished_at = now ;
        waittime = transactions[transaction_timestamp].started_at - transactions[transaction_timestamp].created_at ;
        elapsedtime = transactions[transaction_timestamp].finished_at - transactions[transaction_timestamp].started_at ;
        console.log(pgm + 'finished running ' + transactions[transaction_timestamp].pgm + ', waittime = ' + waittime + ' ms. elapsed time = ' + elapsedtime + ' ms');
        delete transactions[transaction_timestamp] ;
        if (!Object.keys(transactions).length) return ;
        for (key in transactions) {
            // start next long running transaction or publish
            transactions[key].running = true ;
            transactions[key].started_at = now ;
            waittime = transactions[key].started_at - transactions[key].created_at ;
            if (debug) console.log(pgm + 'resumed ' + transactions[key].pgm + '. waittime ' + waittime + ' ms') ;
            transactions[key].cb(key) ;
            break ;
        }
    } // end_transaction

    // keep track of last OK publish timestamp. minimum interval between publish is 30 seconds (shared for MN and MN wallet sites)
    // set in z_site_publish in this client (MN or wallet)
    // set by incoming published messages from other MN sessions (MN or wallets)

    var last_published = 0 ; // timestamp for last OK publish. minimum interval between publish is 30 seconds (MN and wallets)
    var last_published_hash = {} ; // keep info about the last publish
    function get_last_published () {
        return last_published ;
    }

    // detected ratelimit error in published timestamp.
    function ratelimit_error (published) {
        var pgm = module + '.ratelimit_error: ' ;
        var pgm2 ;
        var timestamp_x, timestamp, user_path, encrypt, group_debug_seq ;
        console.log(pgm + 'error. publish at ' + published + ' failed. ratelimit error. interval = ' + last_published_hash[published].interval + ', user_path = ' + last_published_hash[published].user_path) ;
        // any OK publish with same user_path in a later point in time?
        user_path = last_published_hash[published].user_path ;
        if (!user_path) console.log(pgm + 'error. user_path is missing. published = ' + published + ', last_published_hash = ' + JSON.stringify(last_published_hash)) ;
        for (timestamp_x in last_published_hash) {
            timestamp = parseInt(timestamp_x) ;
            if (timestamp <= published) continue ;
            if (last_published_hash[timestamp_x].user_path != user_path) continue ;
            if (last_published_hash[timestamp_x].interval && (last_published_hash[timestamp_x].interval < 30)) continue ;
            console.log(pgm + 'ignoring ratelimit error for ' + user_path + '. found a later OK publish at ' + timestamp) ;
            return ;
        } // for
        group_debug_seq = debug_group_operation_start() ;
        debug_group_operation_update(group_debug_seq, {msgtype: 'ratelimit'}) ;
        pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
        console.log(pgm2 + 'Using group_debug_seq ' + group_debug_seq + ' for this publish operation after a ratelimit error');
        encrypt = last_published_hash[published].encrypt ;
        if (last_published_hash[published].system == 'MN') {
            // new publish in MoneyNetwork session to replace failed publish
            if (!last_published_hash[published].hasOwnProperty('retry_publish_nterval')) last_published_hash[published].retry_publish_interval = 0 ;
            z_site_publish({inner_path: user_path + 'content.json', group_debug_seq: group_debug_seq}, function (res) {
                var pgm = module + '.ratelimit_error z_site_publish callback: ' ;
                var pgm2, retry ;
                pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                // todo: handle failed publish: 30, 60, 120 etc seconds between retry
                if (res == 'ok') {
                    debug_group_operation_end(group_debug_seq) ;
                    return ;
                }
                // retry publish after 30, 60, 120 etc seconds
                if (last_published_hash[published].retry_publish_interval == 0) last_published_hash[published].retry_publish_interval = 30 ;
                else last_published_hash[published].retry_publish_interval = last_published_hash[published].retry_publish_interval * 2 ;
                console.log(pgm2 + 'published failed with ' + JSON.stringify(res) + '. retry publish in ' + last_published_hash[published].retry_publish_interval + ' seconds') ;
                retry = function () { ratelimit_error(published) } ;
                setTimeout(retry, last_published_hash[published].retry_publish_interval * 1000) ;
                debug_group_operation_end(group_debug_seq) ;
            }) ; // z_site_publish callback
        }
        else {
            // new publish in wallet session to replace failed publish
            // todo: send start_publish message to wallet session with cb_id = -1
            queue_publish({client: true, cb_id: -1, encrypt: encrypt, group_debug_seq: group_debug_seq}, function(cb_id, encrypt) {
                var pgm = module + '.ratelimit_error queue_publish callback 1: ' ;
                var pgm2, request ;
                pgm2 = get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                // callback released from publish queue. send start_publish message to wallet session
                request = {
                    msgtype: 'start_publish',
                    cb_id: cb_id
                } ;
                encrypt.send_message(request, {response:30000, group_debug_seq: group_debug_seq}, function (response) {
                    var pgm = module + '.ratelimit_error send_message callback 2: ' ;
                    console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                    if (response && response.error && response.error.match(/^Timeout /)) {
                        // Timeout. Wallet session maybe not running
                        // keep in publish queue for 15 seconds before continue with next row
                        console.log(pgm + 'start_publish timeout. wallet session maybe not running. keeping wallet publishing in queue for the next 10 seconds');
                        publish_queue[0].timeout_at = new Date().getTime() ;
                        debug_group_operation_end(group_debug_seq, 'Timeout. No start_publish response from wallet session') ;
                        return ;
                    }
                    if (!response || response.error) {
                        // Unexpected error returned from wallet
                        console.log(pgm + 'error. start_publish request returned ' + JSON.stringify(response)) ;
                        publish_queue.splice(0,1) ;
                        debug_group_operation_end(group_debug_seq, 'Error. start_publish response from wallet was ' + JSON.stringify(response)) ;
                        return ;
                    }
                    // OK queue_publish. publish started in wallet session. wait for published message from wallet session
                    console.log(pgm + 'OK start_publish response from wallet session. wait for published message before continue with next row in publish queue');
                    debug_group_operation_end(group_debug_seq) ;

                }) ; // send_message callback 2

            }) ; // queue_publish callback 1

        }

    } // ratelimit_error

    // published. modified timestamp from content.json file
    // system: MN or W
    // encrypt: MoneyNetworkAPI instance
    function set_last_published (published, system, encrypt_or_user_path) {
        var pgm = module + '.set_last_published: ' ;
        var old_last_published, updated, elapsed, user_path, previous_published, next_published, timestamp_x, timestamp, encrypt ;
        // check params
        if (typeof published != 'number') throw pgm + 'invalid call. parameter 1 timestamp published must be a unix timestamp (seconds or milliseconds)' ;
        if (['MN','W'].indexOf(system) == -1) throw pgm + 'invalid call. parameter 2 system must be either MN or W' ;
        if (system == 'MN') {
            // param 3 is user_path
            user_path = encrypt_or_user_path ;
        }
        else {
            // param 3 is encrypt object
            encrypt = encrypt_or_user_path ;
            if (!is_MoneyNetworkAPI(encrypt)) throw pgm + 'invalid call. parameter 3 encrypt must be a instance of MoneyNetworkAPI' ;
            user_path = encrypt.other_user_path ;
            if (!user_path) throw pgm + 'invalid call. user_path is not yet initialized in encrypt object' ;
        }
        // save publish information
        if (published > 9999999999) published = Math.floor(published / 1000) ; // ms => s
        old_last_published = last_published ;
        if (published > last_published) {
            last_published = published ;
            updated = true ;
        }
        else updated = false ;
        elapsed = last_published - old_last_published ;
        console.log(pgm + 'user_path = ' + user_path + ', elapsed = ' + elapsed + ', old_last_published = ' + old_last_published + ', last_publish = ' + last_published) ;

        // add to last_publish_hash and check distance to previous and next publish
        last_published_hash[published] = { system: system, user_path: user_path, encrypt: encrypt } ;
        previous_published = null ;
        next_published = null ;
        for (timestamp_x in last_published_hash) {
            timestamp = parseInt(timestamp_x) ;
            if ((timestamp < published) && (timestamp > previous_published)) previous_published = timestamp ;
            if ((timestamp > published) && (timestamp < next_published)) next_published = timestamp ;
        }
        console.log(pgm + 'previous_published = ' + previous_published + ', published = ' + published + ', next_published = ' + next_published) ;
        if (previous_published) {
            last_published_hash[published].interval = published - previous_published ;
            if (last_published_hash[published].interval < 30) ratelimit_error(published) ;
        }
        if (next_published) {
            last_published_hash[next_published].interval = next_published - published ;
            if (last_published_hash[next_published].interval < 30) ratelimit_error(next_published) ;
        }
        return updated ;
    }

    // queue with callbacks waiting for next publish. publish queue managed by MN session.
    var publish_queue = [] ; // pending publish. first may be running x
    var next_cb_id = 0 ;
    function queue_publish (options, cb) {
        var pgm = module + '.queue_publish: ' ;
        var cb2, cb_done, pgm2 ;
        // console.log(pgm + 'options=', options, ', cb=', cb) ;
        if (typeof cb != 'function') throw pgm + 'invalid call. parameter 2 cb must be a callback function' ;
        pgm2 = get_group_debug_seq_pgm(pgm, options.group_debug_seq) ;
        // extend cb. has cb run or not. cb must already run and must only run once.
        // using try catch block in JS code to ensure that exceptions does not stop publishing
        cb_done = false ;
        cb2 = function(pgm, e) {
            if (cb_done) return ;
            console.log(pgm + e.message);
            console.log(e.stack);
            if (e) console.log(pgm2 + 'queue_publish failed with "' + e.message + '". running cb anyway') ;
            cb() ;
        };
        // is_client. wallet or MN. publish queue is managed by MN session.
        try {
            is_client(function(client) {
                var pgm = module + '.queue_publish is_client callback 1: ' ;
                var cb_id, request, pgm2 ;
                pgm2 = get_group_debug_seq_pgm(pgm, options.group_debug_seq) ;

                try {
                    if (client) {
                        // client (wallet session). send message to MN publish queue
                        // wallet session wish to start a publish. using messages "queue_publish", "start_publish" and "published" (-p messages processed by MoneyNetworkAPILib)
                        if (!options.encrypt) throw pgm + 'invalid call. options.encrypt (MoneyNetworkAPI instance) is required' ;
                        if (!is_MoneyNetworkAPI(options.encrypt)) throw pgm + 'invalid call. options.encrypt must be a MoneyNetworkAPI instance' ;
                        // 1) get unique cb_id from sequence. used in messages between MN and wallet sessions
                        next_cb_id++ ;
                        cb_id = next_cb_id ;
                        // MN-wallet session?
                        if (!options.encrypt.sessionid) {
                            console.log(pgm + 'No MN-Wallet session handshake. Continue with publish without MN publish queue. May cause problems with not distributed content.json due to ratelimit check in receiving peers') ;
                            cb(cb_id, options.encrypt) ;
                            return ;
                        }
                        // 2) send "queue_publish" message to MN. Expects OK (added to queue) or timeout (MN session is not running)
                        // timeout 30 seconds. important to wait for MN publish queue response. too many publish will cause problem with not distributed content.json file
                        request = {
                            msgtype: 'queue_publish',
                            cb_id: cb_id
                        } ;
                        console.log(pgm2 + 'sending queue_publish request to MN. request = ' + JSON.stringify(request)) ;
                        options.encrypt.send_message(request, {response: 30000}, function (response) {
                            var pgm = module + '.queue_publish send_message callback 2: ' ;
                            var pgm2 ;
                            pgm2 = get_group_debug_seq_pgm(pgm, options.group_debug_seq) ;

                            try {
                                console.log(pgm2 + 'response = ' + JSON.stringify(response)) ;
                                if (response && response.error && response.error.match(/^Timeout /)) {
                                    // Timeout. OK. MN is not running. Continue with normal publish without MN publish queue
                                    // return cb_id and encrypt to publish cb anyway. Maybe request was received OK in MN but registered as timeout in wallet session
                                    console.log(pgm2 + 'queue_publish timeout. continue with normal publish. may cause problems with not distributed content.json due to ratelimit check in receiving peers') ;
                                    console.log(pgm2 + 'cb_id = ', cb_id, ', cb=', cb) ;
                                    cb(cb_id, options.encrypt) ;
                                    return ;
                                }
                                if (!response || response.error) {
                                    // Unexpected error returned from MN
                                    console.log(pgm2 + 'queue_publish request returned ' + JSON.stringify(response)) ;
                                    cb(null) ;
                                    return ;
                                }
                                if (response.msgtype == 'start_publish') {
                                    // start_publish response from MN. Ready for publish in wallet session
                                    publish_queue.push({
                                        client: true,
                                        cb_id: cb_id,
                                        options: options,
                                        publishing: true
                                    }) ;
                                    // execute publish cb
                                    cb(cb_id, options.encrypt) ;
                                }
                                else {
                                    // OK queue_publish. publish request was queue in MN session. wait for start_publish message from MN before starting publish
                                    publish_queue.push({
                                        client: true,
                                        cb: cb,
                                        cb_id: cb_id,
                                        options: options
                                    }) ;
                                    console.log(pgm2 + 'OK queue_publish. wait for start_publish message from MN') ;
                                    // 5) W2 will wait for "start_publish" message from MN with cb_id. Return OK and run cb
                                    // 6) send "published" message to MN with published result and last_published timestamp
                                }

                            }
                            catch (e) {cb2(pgm, e)}

                        }) ; // send_message callback 2
                    }
                    else if (options.client) {
                        // MN session received queue_publish request from wallet site. see process_publish_messages request.msgtype == 'queue_publish'
                        publish_queue.push({
                            client: true,
                            cb: cb,
                            cb_id: options.cb_id,
                            options: { encrypt: options.encrypt}
                        }) ;
                    }
                    else {
                        // MN session. MN session wish to start a publish.
                        // add cb to queue and wait for publish demon to start callback
                        publish_queue.push({
                            client: false,
                            cb: cb
                        }) ;
                    }

                }
                catch (e) { cb2(pgm, e)}

            }) ; // is_client callback 1
        }
        catch (e) {cb2(pgm, e) }
    } // queue_publish

    // callback for publish message processing (queue_publish, start_publish and published messages)
    // called from demon process for incoming -p optional messages
    function process_publish_messages (inner_path, encrypt, encrypted_request, request, extra) {
        var pgm = module + '.process_publish_messages: ' ;
        var pos, file_timestamp, response_timestamp, request_timestamp, request_timeout_at, response, error,
            send_response, group_debug_seq, now, msgtype, notification ;

        try {
            if (encrypt.destroyed) {
                // MoneyNetworkAPI instance has been destroyed. Maybe deleted session?
                console.log(pgm + 'ignoring incoming message ' + inner_path + '. session has been destroyed. reason = ' + encrypt.destroyed);
                return;
            }
            if (!encrypt.debug) encrypt.setup_encryption({debug: true}) ;

            // get a group debug seq. track all connected log messages. there can be many running processes
            if (extra && extra.group_debug_seq) group_debug_seq = extra.group_debug_seq ;
            else group_debug_seq = debug_group_operation_start();
            pgm = module + '.process_publish_messages/' + group_debug_seq + ': ';
            console.log(pgm + 'Using group_debug_seq ' + group_debug_seq + ' for this ' + (request && request.msgtype ? 'receive ' + request.msgtype + ' message' : 'process_publish_messages') + ' operation', group_debug_seq);
            if (request && request.msgtype) MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {msgtype: request.msgtype}) ;

            console.log(pgm + 'processing inner_path = ' + inner_path + (encrypt.debug ? ' with ' + encrypt.debug : ''));

            // get file timestamp. used in response. double link between request and response
            pos = inner_path.lastIndexOf('.');
            file_timestamp = parseInt(inner_path.substr(pos + 1));
            console.log(pgm + 'file_timestamp = ' + file_timestamp);

            // remove any response timestamp before validation (used in response filename)
            response_timestamp = request.response;
            delete request.response; // request received. must use response_timestamp in response filename
            request_timestamp = request.request;
            delete request.request; // response received. todo: must be a response to previous send request with request timestamp in request filename
            request_timeout_at = request.timeout_at;
            delete request.timeout_at; // request received. when does request expire. how long does other session wait for response

            // request timeout? check with and without "total_overhead"
            now = new Date().getTime() ;
            if (request_timeout_at < now) {
                console.log(pgm + 'timeout. file_timestamp = ' + file_timestamp + ', request_timeout_at = ' + request_timeout_at + ', now = ' + now + ', total_overhead = ' + extra.total_overhead) ;
                console.log(pgm + 'extra = ' + JSON.stringify(extra)) ;
                if (request_timeout_at + extra.total_overhead < now) {
                    console.log(pgm + 'error. request timeout. ignoring request = ' + JSON.stringify(request) + ', inner_path = ' + inner_path);
                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'Timeout. Incoming request is too old') ;
                    // publish operation failed. send group_debug_operations stat and notification to other process. other process should retry message with changed timeout setting
                    msgtype = request.msgtype ;
                    if (msgtype == 'queue_publish') notification = 'MoneyNetwork: Please resend queue_publish request' ; // old incoming queue_publish request from wallet was rejected
                    else if (msgtype == 'start_publish') notification = 'Wallet: Please resend start_publish message' ; // old incoming start_publish request from MoneyNetwork was rejected
                    else if (msgtype == 'check_publish') notification = 'Wallet: Please resend check_publish message' ; // old incoming check_publish request from MoneyNetwork was rejected
                    else if (msgtype == 'published') notification = 'MoneyNetwork: Please resend published message' ; // old incoming published message from wallet was rejected
                    else {
                        console.log(pgm + 'error. unknown msgtype ' + msgtype + '. no timeout message was sent') ;
                        return ;
                    }
                    encrypt.send_timeout_message(msgtype, notification) ;
                    return ;
                }
                else {
                    console.log(pgm + 'warning. request timeout. adding total_overhead ' + extra.total_overhead + ' ms to request_timeout_at. other session may reject response after timeout');
                    request_timeout_at = request_timeout_at + extra.total_overhead ;
                    console.log(pgm + 'new request_timeout_at = ' + request_timeout_at) ;
                }
            }

            console.log(pgm + 'request = ' + JSON.stringify(request));
            response = {msgtype: 'response'};

            // cb: post response callback. used in send_mt after sending OK response to MN
            send_response = function (error, cb) {
                var pgm = module + '.process_publish_messages.send_response/' + group_debug_seq + ': ' ;
                if (!response_timestamp) {
                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'no response requested') ;
                    return;
                } // no response was requested
                if (error) response.error = error;
                if (!cb) cb = function () {};

                // send response to other session
                encrypt.send_message(response, {timestamp: response_timestamp, msgtype: request.msgtype, request: file_timestamp, timeout_at: request_timeout_at, group_debug_seq: group_debug_seq}, function (res) {
                    var pgm = module + '.process_incoming_message.send_response send_message callback/' + group_debug_seq + ': ';
                    console.log(pgm + 'res = ' + JSON.stringify(res));
                    cb();
                }); // send_message callback 3

            }; // send_response

            // validate and process incoming json message and process
            error = MoneyNetworkAPILib.validate_json(pgm, request, null, 'api');
            if (error) response.error = 'message is invalid. ' + error;
            else if (request.msgtype == 'queue_publish') {
                // request = {"msgtype": "queue_publish", "cb_id": 1, "response": 1476720214851, "timeout_at": 1509978083371};
                // MN received a queue_publish request from a wallet session.
                (function(){
                    var pgm = module + '.process_publish_messages.' + request.msgtype + '/' + group_debug_seq + ': ';
                    var elapsed_s ;
                    elapsed_s = Math.round(now/1000) - last_published ;
                    console.log(pgm + 'publish_queue.length = ' + publish_queue.length + ', elapsed since last publish = ' + elapsed_s) ;
                    if (!publish_queue.length && (elapsed_s >= 30)) {
                        // shortcut. publish queue is empty and interval since last publish >= 30 seconds
                        // skip OK response and go direct to start_publish response.
                        response.msgtype = 'start_publish' ;
                        response.cb_id = request.cb_id ;
                        publish_queue.push({
                            client: true,
                            cb_id: request.cb_id,
                            options: { encrypt: encrypt},
                            publishing: now
                        }) ;
                    }
                    // add wallet publish request to publish queue. publish demon will execute callback keeping interval between publish >= 30 seconds
                    else queue_publish({client: true, cb_id: request.cb_id, encrypt: encrypt, group_debug_seq: group_debug_seq}, function(cb_id, encrypt) {
                        var pgm = module + '.process_publish_messages.' + request.msgtype + ' queue_publish callback 1: ';
                        var request ;
                        // callback released from publish queue. send start_publish message to wallet session
                        request = {
                            msgtype: 'start_publish',
                            cb_id: cb_id
                        } ;
                        encrypt.send_message(request, {response:5000, group_debug_seq: group_debug_seq}, function (response) {
                            var pgm = module + '.process_publish_messages.' + request.msgtype + ' send_message callback 2/' + group_debug_seq + ': ';
                            console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // Timeout. Wallet session maybe not running
                                // keep in publish queue for 15 seconds before continue with next row
                                console.log(pgm + 'start_publish timeout. wallet session maybe not running. keeping wallet publishing in queue for the next 10 seconds');
                                publish_queue[0].timeout_at = new Date().getTime() ;
                                return ;
                            }
                            if (!response || response.error) {
                                // Unexpected error returned from wallet
                                console.log(pgm + 'error. start_publish request returned ' + JSON.stringify(response)) ;
                                publish_queue.splice(0,1) ;
                                return ;
                            }
                            // OK queue_publish. publish started in wallet session. wait for published message from wallet session
                            console.log(pgm + 'OK start_publish response from wallet session. wait for published message before continue with next row in publish queue');
                        }) ;

                    }) ;
                    // return OK response to queue_publish
                    // wallet session will receive start_publish message later when publish queue is ready for this publish
                })() ;
                // end queue_publish
            }
            else if (request.msgtype == 'start_publish') {
                // request = {"msgtype":"start_publish","cb_id":1}
                // wallet has previously sent a queue_publish request to MN publish queue
                // queue_publish cb was saved in publish_queue.
                // wallet received a start_publish request from MN publish queue demon
                // ready to start publish in wallet session
                (function(){
                    var pgm = module + '.process_publish_messages.' + request.msgtype + '/' + group_debug_seq + ': ';
                    var found, i ;
                    // check publish_queue.
                    found = -1 ;
                    for (i=0 ; i<publish_queue.length ; i++) {
                        if (publish_queue[i].cb_id == request.cb_id) {
                            found = i ;
                            break ;
                        }
                    } // for i
                    if (found == -1) return send_response('Error. No publish request with cb_id ' + request.cb_id + ' was found in publish queue') ;
                    if (publish_queue[found].publishing) {
                        console.log(pgm + 'warning. has already received start_publish request for cb_id ' + request.cb_id + '. returning OK response to MN anyway') ;
                        return send_response() ;
                    }
                    // send OK response to MN
                    console.log(pgm + 'starting queued publish cb in W2') ;
                    // start publish process
                    publish_queue[found].publishing = true ;
                    publish_queue[found].cb(request.cb_id, encrypt) ;
                })() ;
                // end start_publish
            }
            else if (request.msgtype == 'check_publish') {
                // long running wallet publish. MN session is checking if wallet publish still is running
                // problem can be network problems, lost messages (timeout) or JS errors in wallet
                // MN will check with wallet once every 20 seconds and finish waiting for wallet publish to finish after 60 seconds
                (function() {
                    var pgm = module + '.process_publish_messages.' + request.msgtype + '/' + group_debug_seq + ': ';
                    var i ;
                    for (i=0 ; i<publish_queue.length ; i++) {
                        if (publish_queue[i].cb_id == request.cb_id) return send_response() ;
                    } // for i
                    response.error = 'No publishing process was found with cb_id = ' + request.cb_id ;
                })() ;
                // end check_publish
            }
            else if (request.msgtype == 'published') {
                // request = {"msgtype":"published","cb_id":1,"res":"ok","last_published_at":1510050414}
                // wallet has finished publishing content and is reporting publish result and timestamp for last ok publish to MN
                // todo: keep track of publish timestamps for the different content.json files. publish interval < 30 seconds = ratelimit error = rejected content.json file
                (function(){
                    var pgm = module + '.process_publish_messages.' + request.msgtype + '/' + group_debug_seq + ': ';
                    var found, i ;
                    set_last_published(request.last_published_at, 'W', encrypt) ;
                    // check publish_queue.
                    // todo: add sessionid to publish_queue? debug and check options object
                    found = -1 ;
                    for (i=0 ; i<publish_queue.length ; i++) {
                        if (publish_queue[i].client &&
                            publish_queue[i].publishing &&
                            publish_queue[i].cb_id == request.cb_id) {
                            found = i ;
                            break ;
                        }
                    } // for i
                    if (found == -1) return send_response('Error. No publish request with cb_id ' + request.cb_id + ' was found in publish queue') ;
                    publish_queue.splice(found,1) ;
                })() ;
            }
            else response.error = 'Unknown msgtype ' + request.msgtype;
            console.log(pgm + 'response = ' + JSON.stringify(response));

            send_response();
            // end try
        }
        catch (e) {
            console.log(pgm + e.message);
            console.log(e.stack);
            throw(e);
        }
    } // process_publish_messages

    // run one every second and check publish queue
    function publish_demon () {
        var pgm = module + '.publish_demon: ' ;
        var now, elapsed_ms, elapsed_s, request, encrypt, last_check_publish, request, encrypt ;
        if (!publish_queue.length) {
            // console.log(pgm + 'no rows in publish queue') ;
            return ;
        }
        // check first row in publish queue.
        now = new Date().getTime() ;
        if (publish_queue[0].publishing) {
            // is publishing
            elapsed_ms = now - publish_queue[0].publishing ;
            elapsed_s = Math.floor(elapsed_ms/1000) ;
            if (publish_queue[0].client) {
                // wallet session is publishing. waiting for published message from client
                console.log(pgm + 'publishing content in wallet session. elapsed time ' + elapsed_ms + ' ms. sessionid = ' + publish_queue[0].options.encrypt.sessionid) ;
                if (elapsed_s >= 60) {
                    console.log(pgm + 'aborting wait for wallet publish. waited ' + elapsed_s + ' seconds') ;
                    publish_queue.splice(0,1) ;
                    return ;
                }
                last_check_publish = publish_queue[0].check_publish || publish_queue[0].publishing ;
                elapsed_ms = now - last_check_publish ;
                elapsed_s = Math.floor(elapsed_ms/1000) ;
                if (elapsed_s >= 20) {
                    console.log(pgm + 'long running wallet publish. sending check_publish request to wallet') ;
                    publish_queue[0].check_publish = now ;
                    request = {
                        msgtype: 'check_publish',
                        cb_id: publish_queue[0].cb_id
                    } ;
                    console.log
                    encrypt = publish_queue[0].options.encrypt ;
                    encrypt.setup_encryption({debug: true}) ;
                    encrypt.send_message(request, {response: 5000}, function (response) {
                        var pgm = module + '.publish_queue_demon send_message callback 1a: ';
                        console.log(pgm + 'response = ' + JSON.stringify(response));
                        if (response && response.error && response.error.match(/^Timeout /)) {
                            // Timeout. Wallet session maybe not running
                            // keep in publish queue for <n> seconds before continue with next row
                            console.log(pgm + 'check_publish timeout. remove wallet publish from publish queue');
                            if (publish_queue[0].check_publish == now) publish_queue.splice(0,1) ;
                            return ;
                        }
                        if (!response || response.error) {
                            // Unexpected error returned from MN
                            console.log(pgm + 'error. check_publish ' + JSON.stringify(response)) ;
                            publish_queue.splice(0,1) ;
                            return ;
                        }
                        console.log(pgm + 'OK check_publish response from wallet. Continue waiting for wallet publish to finish') ;
                    }) ;
                    return ;
                }
            }
            else {
                // MN session is publishing.
                console.log(pgm + 'publishing content in MN session. elapsed time ' + elapsed_ms + ' ms.') ;
            }
            return ;
        }
        // is not publishing
        elapsed_s = Math.floor(now/1000) - last_published ;
        if (elapsed_s < 30) {
            // less that 30 seconds since last publish
            console.log(pgm  + ' wait. less than 30 seconds since last publish. elapsed ' + elapsed_s + ' seconds') ;
            return ;
        }
        // OK for next publish. 30 seconds or more since last publish
        publish_queue[0].publishing = now ;
        if (publish_queue[0].client) {
            // wallet session publish is next in publish queue
            request = {
                msgtype: 'start_publish',
                cb_id: publish_queue[0].cb_id
            } ;
            console.log(pgm + 'sending start_publish message to wallet session. request = ' + JSON.stringify(request)) ;
            encrypt = publish_queue[0].options.encrypt ;
            encrypt.setup_encryption({debug: true}) ;
            encrypt.send_message(request, {response: 5000}, function (response) {
                var pgm = module + '.publish_queue_demon send_message callback 1b: ' ;
                console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                if (response && response.error && response.error.match(/^Timeout /)) {
                    // Timeout. Wallet session maybe not running
                    // keep in publish queue for <n> seconds before continue with next row
                    console.log(pgm + 'start_publish timeout. wallet session maybe not running. keeping wallet publish request in queue for the next 10 seconds');
                    publish_queue[0].timeout_at = new Date().getTime() ;
                    return ;
                }
                if (!response || response.error) {
                    // Unexpected error returned from MN
                    console.log(pgm + 'error. start_publish request returned ' + JSON.stringify(response)) ;
                    publish_queue.splice(0,1) ;
                    return ;
                }
                // OK queue_publish. publish request was queue in MN session. wait for start_publish message from MN before starting publish
            }); // send_message callback 1


        }
        else {
            // MN session publish is next in publish queue
            publish_queue[0].cb() ;
        }

    } // publish_queue_demon

    // start publish_queue_demon
    function start_publish_queue_demon () {
        var pgm = module + '.start_publish_queue_demon: ' ;
        if (!ZeroFrame) return setTimeout(start_publish_queue_demon, 1000) ;
        is_client(function(client){
            var pgm = module + '.start_publish_queue_demon is_client callback: ' ;
            // start publish queue. Only in MN session
            console.log(pgm + 'client = ' + client) ;
            if (!client) setInterval(publish_demon, 1000) ;
        }) ;
    }
    setTimeout(start_publish_queue_demon, 1000) ;


    // sitePublish
    // - privatekey is not supported
    // - inner_path must be an user directory /^merged-MoneyNetwork\/(.*?)\/data\/users\/content\.json$/ path
    // - minimum interval between publish is 30 seconds (shared for MN and MN wallet sites)
    function z_site_publish (options, cb) {
        var pgm = module + '.z_site_publish: ' ;
        var inner_path, match4, auth_address, filename, hub, encrypt, user_path ;
        if (!ZeroFrame) throw pgm + 'sitePublish aborted. ZeroFrame is missing. Please use ' + module + '.init({ZeroFrame:xxx}) to inject ZeroFrame API into ' + module;
        // check private key
        if (options.privatekey) {
            console.log(pgm + 'warning. siteSign with privatekey is not supported. Ignoring privatekey') ;
            delete options.privatekey ;
        }
        // check inner_path
        inner_path = options.inner_path ;
        if (!inner_path || inner_path.match(inner_path_re2)) throw 'sitePublish aborted. Not a merger-site path. inner_path = ' + inner_path ; // old before moving to merger sites
        if (!(match4=inner_path.match(inner_path_re4))) throw 'sitePublish aborted. Not a merger-site path. inner_path = ' + inner_path ;
        auth_address = match4[2] ;
        if (!ZeroFrame.site_info) throw 'sitePublish aborted. ZeroFrame is not yet ready' ;
        if (!ZeroFrame.site_info.cert_user_id) throw 'sitePublish aborted. No ZeroNet certificate selected' ;
        if (auth_address != ZeroFrame.site_info.auth_address) {
            console.log(pgm + 'inner_path = ' + inner_path + ', auth_address = ' + auth_address + ', ZeroFrame.site_info.auth_address = ' + ZeroFrame.site_info.auth_address);
            throw pgm + 'sitePublish aborted. Publishing an other user directory.' ;
        }
        filename = match4[3] ;
        if (filename != 'content.json') {
            console.log(pgm + 'warning. sitePublish should be called with path to user content.json file. inner_path = ' + JSON.stringify(inner_path)) ;
            hub = match4[1] ;
            inner_path = 'merged-' + get_merged_type() + '/' + hub + '/data/users/' + auth_address + '/content.json' ;
            options.inner_path = inner_path ;
        }
        // check encrypt option. wallet sites only. wallet sites should use MN publish queue to keep interval between publish >= 30 seconds
        if (options.encrypt) {
            // wallet publish with encrypt object
            if (!is_MoneyNetworkAPI(options.encrypt)) throw pgm + 'encrypt must be a MoneyNetworkAPI instance' ;
            encrypt = options.encrypt ;
            delete options.encrypt ;
            console.log(pgm + 'wallet publish with encrypt object') ;
        }
        else {
            // MN publish without encrypt object
            user_path = 'merged-' + get_merged_type() + '/' + hub + '/data/users/' + auth_address + '/' ;
            console.log(pgm + 'MN publish without encrypt object') ;
        }

        // start publish transaction. publish must wait for long running update transactions to finish and
        console.log(pgm + 'calling start_transaction') ;
        start_transaction(pgm, function(transaction_timestamp){
            var pgm = module + '.z_site_publish start_transaction callback 1: ' ;
            console.log(pgm + 'start_transaction OK') ;

            // add publish callback to publish queue and wait for publish demon to start publish
            // callback parameters cb_id and encrypt. only wallet session. wallet must send published message to MN when finish publishing
            // console.log(pgm + 'calling queue_publish') ;
            queue_publish({encrypt: encrypt}, function (cb_id, encrypt) {
                var pgm = module + '.z_site_publish queue_publish callback 2: ' ;
                var debug_seq, site_publish_cb, site_publish_cb_done, process_id, site_publish_timeout ;
                // console.log(pgm + 'queue_publish OK. cb_id = ', cb_id, ', encrypt = ', encrypt) ;

                // prevent publish operation hanging for ever. add 60 seconds timeout to sitePublish request
                site_publish_cb_done = false ;
                site_publish_cb = function (res) {
                    var pgm = module + '.z_site_publish sitePublish callback 3: ' ;
                    var run_cb, get_content_json ;
                    // stop timeout process + check for already run callback
                    if (process_id) {
                        try {$timeout.cancel(process_id)}
                        catch (e) {}
                        process_id = null ;
                    }
                    if (site_publish_cb_done) return ; // sitePublish cb has already run
                    site_publish_cb_done = true ;
                    // ok. run sitePublish callback
                    debug_z_api_operation_end(debug_seq, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
                    debug_seq = null ;

                    // run sitePublish cb callback (content published)
                    run_cb = function () { cb(res)} ;
                    setTimeout(run_cb, 0) ;

                    // res = ok only. get content.json modified timestamp. used in MN publish queue
                    get_content_json = function (cb) {
                        if (res != 'ok') return cb() ; // publish failed. keep last_published timestamp
                        z_file_get(pgm, {inner_path: inner_path, required: true}, function (content_str) {
                            var content ;
                            content = JSON.parse(content_str) ;
                            // publish ok. update last_published timestamp
                            if (cb_id) set_last_published(content.modified, 'W', encrypt) ;
                            else set_last_published(content.modified, 'MN', user_path) ;
                            cb() ;
                        }) ;
                    } ; // get_modified
                    get_content_json(function() {
                        var pgm = module + '.z_site_publish send_message callback 5: ' ;
                        var request ;

                        // end transaction. start any transaction waiting for publish to finish
                        end_transaction(transaction_timestamp) ;

                        // remove publish callback from publish queue
                        if (cb_id) {
                            // wallet session
                            if (!encrypt.sessionid) return ; // no MN-W2 session. published without MN publish queue
                            console.log(pgm + 'wallet session is sending published message to MoneyNetwork') ;
                            request = {
                                msgtype: 'published',
                                cb_id: cb_id,
                                res: res,
                                last_published_at: last_published
                            } ;
                            console.log(pgm + 'published request = ' + JSON.stringify(request)) ;
                            encrypt.send_message(request, {response: 5000}, function (response) {
                                var pgm = module + '.z_site_publish send_message callback 5: ' ;
                                console.log(pgm + 'published response = ' + JSON.stringify(response)) ;
                            }) ; // send_message callback 5
                        }
                        else {
                            // MoneyNetwork session. This publish should be first row in publish queue
                            if (!publish_queue.length) console.log(pgm + 'error. MN just published and no rows in publish queue') ;
                            else if (publish_queue[0].client) console.log(pgm + 'error. MN just published and first row in publish queue is a wallet publish') ;
                            else if (!publish_queue[0].publishing) console.log(pgm + 'error. MN just published and first row in publish queue is not publishing') ;
                            else {
                                console.log(pgm + 'MoneyNetwork publish removed from publish queue') ;
                                publish_queue.splice(0, 1) ;
                            }
                        }

                    }) ; // get_content_json callback 4


                } ; // sitePublish callback 3

                // execute sitePublish callback by either sitePublish or by timeout fnk
                site_publish_timeout = function () {
                    site_publish_cb({error: 'timeout'}) ;
                };
                process_id = setTimeout(site_publish_timeout, 60000) ;


                debug_seq = debug_z_api_operation_start(pgm, inner_path, 'sitePublish') ;
                ZeroFrame.cmd("sitePublish", options, site_publish_cb) ;

            }) ; // queue_publish callback 2

        }) ; // start_transaction callback 1

    } // z_site_publish

    // export MoneyNetworkAPILib
    return {
        set_merged_type: set_merged_type,
        get_merged_type: get_merged_type,
        config: config,
        set_this_user_path: set_this_user_path,
        get_ZeroFrame: get_ZeroFrame,
        get_optional: get_optional,
        get_this_user_path: get_this_user_path,
        is_user_path: is_user_path,
        is_client: is_client,
        is_session: is_session,
        add_session: add_session,
        get_session: get_session,
        get_sessions: get_sessions,
        wait_for_file: wait_for_file,
        redo_file: redo_file,
        delete_session: delete_session,
        delete_all_sessions: delete_all_sessions,
        clear_all_data: clear_all_data,
        aes_encrypt: aes_encrypt,
        aes_decrypt: aes_decrypt,
        add_json_schemas: add_json_schemas,
        get_subsystem: get_subsystem,
        validate_json: validate_json,
        calc_wallet_sha256: calc_wallet_sha256,
        get_wallet_info: get_wallet_info,
        debug_get_next_seq: debug_get_next_seq,
        debug_z_api_operation_start:debug_z_api_operation_start,
        debug_z_api_operation_end: debug_z_api_operation_end,
        get_group_debug_seq_pgm: get_group_debug_seq_pgm,
        validate_timeout_msg: validate_timeout_msg,
        debug_group_operation_start: debug_group_operation_start,
        debug_group_operation_update: debug_group_operation_update,
        debug_group_operation_end: debug_group_operation_end,
        debug_group_operation_get_stat: debug_group_operation_get_stat,
        debug_group_operation_receive_stat: debug_group_operation_receive_stat,
        debug_group_operation_get_response: debug_group_operation_get_response,
        start_transaction: start_transaction,
        end_transaction: end_transaction,
        z_merger_site_add: z_merger_site_add,
        z_file_get: z_file_get,
        z_file_write: z_file_write,
        z_file_delete: z_file_delete,
        z_site_publish: z_site_publish,
        set_last_published: set_last_published,
        get_last_published: get_last_published
    };

})(); // MoneyNetworkAPILib

// MoneyNetworkAPI

// constructor. setup encrypted session between MN and wallet.
// see also MoneyNetworkAPILib.config and MoneyNetworkAPI.setup_encryption
// multiple setup calls are allowed but some values cannot be changed for an existing session
// - debug: true, false or a string (=true). extra messages in browser console for this session
// - ZeroFrame: inject ZeroNet ZeroFrame API class into MoneyNetworkAPI
// - sessionid: a random string. a secret shared between MN and wallet session. used for encryption, session filenames and unlock pwd2 password
// - pubkey (JSEncrypt) and pubkey2 (cryptMessage). Other session public keys for encryption
// - prvkey (JSEncrypt) and userid2 (cryptMessage). This session private keys for encryption
// - this_user_path and other_user_path. full merger site user path string "merged-MoneyNetwork/<hub>/data/users/<auth_address>/"
// - optional. optional files pattern to be added to user content.json file (new users).
// - cb. callback function to process incoming messages for this session
// - extra. hash with any additional session info. Not used by MoneyNetworkAPI
// - sender. only used for wallet to wallet communication. set sender/receiver role for API instance (W2W) and ignores global client/master setting (MN-Wallet)
var MoneyNetworkAPI = function (options) {
    var pgm = 'new MoneyNetworkAPI: ';
    var missing_keys, key, prefix;
    options = options || {};
    this.module = 'MoneyNetworkAPI'; // for debug messages
    this.version = '0.0.1'; // very unstable
    this.debug = options.hasOwnProperty('debug') ? options.debug : false;
    // ZeroFrame API
    if (options.ZeroFrame) MoneyNetworkAPILib.config({ZeroFrame: options.ZeroFrame}) ;
    this.ZeroFrame = MoneyNetworkAPILib.get_ZeroFrame() ;
    // sessionid
    if (options.sessionid && (typeof options.sessionid != 'string')) throw pgm + 'invalid call. options.sessionid must be a string' ;
    this.sessionid = options.sessionid || null;
    // other session public keys
    this.other_session_pubkey = options.pubkey || null;
    this.other_session_pubkey2 = options.pubkey2 || null;

    // this session private keys
    if (options.prvkey) this.this_session_prvkey = options.prvkey ;
    if (options.hasOwnProperty('userid2')) this.this_session_userid2 = options.userid2 ;

    // user paths
    if (options.this_user_path) MoneyNetworkAPILib.config({this_user_path: options.this_user_path});
    this.this_user_path = MoneyNetworkAPILib.get_this_user_path() ;

    // user_path for other session. should be set after reading first incoming message for a new session. cannot change doing a session
    if (options.other_user_path && !MoneyNetworkAPILib.is_user_path(options.other_user_path)) throw pgm + 'invalid options.other_user_path' ;
    this.other_user_path = options.other_user_path ;
    // optional files pattern. add if MoneyNetworkAPI should add optional files support in content.json file before sending message to other session
    this.this_optional = options.optional;
    if (this.this_optional) MoneyNetworkAPILib.config({optional: this.this_optional});
    this.this_optional = MoneyNetworkAPILib.get_optional() ;
    // optional callback function process incoming messages for this session
    if (options.cb) {
        if (typeof options.cb != 'function') throw pgm + 'invalid call. options.cb is not a function' ;
        this.cb = options.cb ;
        if (options.hasOwnProperty('cb_fileget')) this.cb_fileget = options.cb_fileget ? true : false ; // fileGet in message_demon process
        if (options.hasOwnProperty('cb_decrypt')) this.cb_decrypt = options.cb_decrypt ? true : false ; // decrypt in message_demon process
        if (this.cb_decrypt) this.cb_fileget = true ; // cannot decrypt i message_demon without fileGet
    }
    // extra info not used by MoneyNetworkAPI
    this.extra = options.extra ;
    // set sender/receiver role on MoneyNetworkAPI instance level. Used in wallet to wallet communication
    if (options.hasOwnProperty('sender')) {
        if (typeof options.sender != 'boolean') throw pgm + 'invalid call. options.sender must be a boolean' ;
        if (!this.sessionid) throw pgm + 'invalid call. sessionid is required when using the sender parameter' ;
        this.sender = options.sender ;
        this.receiver = !this.sender ;
    }
    if (this.sessionid) {
        // monitor incoming messages for this sessionid.
        MoneyNetworkAPILib.add_session(this.sessionid, {encrypt: this, cb: this.cb, constructor:true}) ;
    }
    else {
        // unknown sessionid. used for get_password message (session restore)
        if (options.this_session_filename) this.this_session_filename = options.this_session_filename;
        if (options.other_session_filename) this.other_session_filename = options.other_session_filename;
    }
    if (!this.debug) return;
    // debug: check encryption setup status:
    missing_keys = [];
    for (key in this) {
        if (['sessionid', 'other_session_pubkey', 'other_session_pubkey2', 'this_session_prvkey', 'this_session_userid2'].indexOf(key) == -1) continue;
        if (this[key] == null) missing_keys.push(key);
        // else if (this.debug) console.log(pgm + key + ' = ' + this[key]) ;
    }
    prefix = this.debug == true ? '' : this.debug + ': ';
    if (missing_keys.length == 0) console.log(pgm + prefix + 'Encryption setup done for ' + (this.hasOwnProperty('sender') ? ' wallet<->wallet' : 'MoneyNetwork<->wallet') + ' communication');
    else console.log(pgm + prefix + 'Encryption setup: waiting for ' + missing_keys.join(', '));
}; // MoneyNetworkAPI

MoneyNetworkAPI.prototype.log = function (calling_pgm, text, group_debug_seq) {
    var pgm = this.module + '.log: ' ;
    var prefix;
    if (!this.debug) return;
    if (arguments.length < 2) throw pgm + 'invalid call. two arguments pgm and text expected' ;
    prefix = (this.debug == true ? '' : this.debug) + (group_debug_seq ? '/' + group_debug_seq : '') + ': ';
    console.log(calling_pgm + prefix + text);
}; // log

// map external and internal property names
MoneyNetworkAPI.prototype.internal_property = function (external_property) {
    if (external_property == 'pubkey') return 'other_session_pubkey' ;
    else if (external_property == 'pubkey2') return 'other_session_pubkey2' ;
    else if (external_property == 'optional') return 'this_optional' ;
    else return external_property ;
} ; // internal_property

// readonly. most values in a MoneyNetworkAPI instance are readonly and cannot be changed
MoneyNetworkAPI.prototype.readonly = function (options, options_property) {
    var pgm = this.module + '.setup_encryption: ';
    var self_property, error ;
    self_property = this.internal_property(options_property) ;
    if (!this[self_property] || !options[options_property] || (this[self_property] == options[options_property])) return ;
    error = pgm +
        'invalid call. ' + options_property + ' cannot be changed. ' +
        'please use new MoneyNetworkAPI to initialize a new instance with new ' + options_property + '. ' +
        'old value was ' + self[self_property] + '. new value is ' + options[options_property] ;
    throw error ;
}; // readonly

// setup encrypted session between MN and wallet.
// see also MoneyNetworkAPILib.config and MoneyNetworkAPI.constructor
// multiple setup calls are allowed but some values cannot be changed for an existing session
// - debug: true, false or a string (=true). extra messages in browser console for this session
// - ZeroFrame: inject ZeroNet ZeroFrame API class into MoneyNetworkAPI
// - sessionid: a random string. a secret shared between MN and wallet session. used for encryption, session filenames and unlock pwd2 password
// - pubkey (JSEncrypt) and pubkey2 (cryptMessage). Other session public keys for encryption
// - prvkey (JSEncrypt) and userid2 (cryptMessage). This session private keys for encryption
// - this_user_path and other_user_path. full merger site user path string "merged-MoneyNetwork/<hub>/data/users/<auth_address>/"
// - optional. optional files pattern to be added to user content.json file (new users).
// - cb. callback function to process incoming messages for this session
MoneyNetworkAPI.prototype.setup_encryption = function (options) {
    var pgm = this.module + '.setup_encryption: ';
    var self, is_new_sessionid, key, missing_keys, error;
    self = this ;
    if (options.hasOwnProperty('debug')) this.debug = options.debug;
    // ZeroFrame API
    if (options.ZeroFrame) MoneyNetworkAPILib.config({ZeroFrame: options.ZeroFrame}) ;
    else if (!this.ZeroFrame) this.ZeroFrame = MoneyNetworkAPILib.get_ZeroFrame() ;
    // sessionid
    if (options.sessionid) {
        self.readonly(options,'sessionid') ;
        is_new_sessionid = !this.sessionid  ; // call add_session. monitor incoming messages for this sessionid
        this.sessionid = options.sessionid;
    }
    // other session public keys
    if (options.pubkey) {
        self.readonly(options,'pubkey') ;
        this.other_session_pubkey = options.pubkey;
    }
    if (options.pubkey2) {
        self.readonly(options,'pubkey2') ;
        this.other_session_pubkey2 = options.pubkey2;
    }
    // this session private keys
    if (options.prvkey) {
        self.readonly(options,'prvkey') ;
        this.this_session_prvkey = options.prvkey;
    }

    if (options.userid2) {
        self.readonly(options,'userid2') ;
        this.this_session_userid2 = options.userid2 ;
    }

    if (options.hasOwnProperty('userid2')) {
        self.readonly(options,'userid2') ;
        this.this_session_userid2 = options.userid2;
    }
    // user paths. full merger site paths
    if (options.this_user_path) {
        // this session. this instance only. readonly and auth_address must be correct (callback)
        MoneyNetworkAPILib.set_this_user_path(
            options.this_user_path, {
                throw: true,
                readonly: true,
                cb: function (error) {
                    if (error) console.log(pgm + error) ;
                    else {
                        self.this_user_path = options.this_user_path ;
                        if (!self.this_user_path) self.this_user_path = MoneyNetworkAPILib.get_this_user_path() ;
                    }
                }
            }
        ) ;
    }
    if (!this.this_user_path) this.this_user_path = MoneyNetworkAPILib.get_this_user_path() ;
    if (options.other_user_path) {
        if (!MoneyNetworkAPILib.is_user_path(options.other_user_path)) throw pgm + 'invalid options.other_user_path' ;
        self.readonly(options,'other_user_path') ;
        this.other_user_path = options.other_user_path ;
    }
    // optional files pattern. add if API should add optional files support in content.json file before sending message to other session
    if (options.optional) MoneyNetworkAPILib.config({optional: this.optional}) ;
    else if (!this.this_optional) this.this_optional = MoneyNetworkAPILib.get_optional() ;
    // optional callback function process incoming messages for this session
    if (options.cb) {
        if (typeof options.cb != 'function') throw pgm + 'invalid call. options.cb is not a function' ;
        this.cb = options.cb ;
        if (options.hasOwnProperty('cb_fileget')) this.cb_fileget = options.cb_fileget ? true : false ; // fileGet in message_demon process
        if (options.hasOwnProperty('cb_decrypt')) this.cb_decrypt = options.cb_decrypt ? true : false ; // decrypt in message_demon process
        if (this.cb_decrypt) this.cb_fileget = true ; // cannot decrypt without fileGet in message_demon process
    }
    if (options.extra) this.extra = options.extra ;
    if (this.sessionid) {
        // known sessionid. new or old session
        if (is_new_sessionid) {
            // monitor incoming messages for this sessionid. cb. optional session level callback function to handle incoming messages for this sessionid
            MoneyNetworkAPILib.add_session(this.sessionid, {encrypt: this, cb: this.cb}) ;
        }
    }
    else {
        // unknown sessionid. restoring old session. used for get_password message (session restore)
        if (options.this_session_filename) this.this_session_filename = options.this_session_filename;
        if (options.other_session_filename) this.other_session_filename = options.other_session_filename;
    }
    if (!this.debug) return;
    // debug: check encryption setup status:
    missing_keys = [];
    for (key in this) {
        if (['sessionid', 'other_session_pubkey', 'other_session_pubkey2', 'this_session_prvkey', 'this_session_userid2'].indexOf(key) == -1) continue;
        if (this[key] == null) missing_keys.push(key);
    }
    if (missing_keys.length == 0) this.log(pgm, 'Encryption setup done for ' + (this.hasOwnProperty('sender') ? ' wallet<->wallet' : 'MoneyNetwork<->wallet') + ' communication');
    else this.log(pgm, 'Encryption setup: waiting for ' + missing_keys.join(', '));
}; // setup_encryption

// destroy/delete MoneyNetworkAPI instance
MoneyNetworkAPI.prototype.destroy = function (reason) {
    var self, key ;
    if (arguments.length == 0) reason = true ;
    self = this ;
    self.destroyed = reason ;
    for (key in self) if (['destroyed', 'module'].indexOf(key) == -1) delete self[key] ;
};

MoneyNetworkAPI.prototype.check_destroyed = function (pgm) {
    if (!this.destroyed) return ;
    throw pgm + 'MoneyNetworkAPI instance has been destroyed. reason = ' + this.destroyed ;
}; // check_destroyed

MoneyNetworkAPI.prototype.is_client = function (cb) {
    if (this.receiver || this.sender) cb(this.receiver) ; // W2W communication. Wallet that starts the communication is the sender/master. receiver is "client".
    else MoneyNetworkAPILib.is_client(cb) ; // MN-W communication. MN session is always the master in MN-W communication
} ; // is_client

// get session filenames for MN <=> wallet communication
MoneyNetworkAPI.prototype.get_session_filenames = function (options, cb) {
    var pgm = this.module + '.get_session_filenames: ' ;
    var self;
    self = this;
    if (!options) options = {} ;
    this.check_destroyed(pgm) ;
    if (!this.sessionid) {
        // no sessionid. must part of a wallet session restore call. wallet session must send get_password request to MN to restore sessionid from Ls
        return cb(this.this_session_filename, this.other_session_filename, null);
    }
    else {
        // session. find filenames and unlock password from sha256 signature
        self.is_client(function (client) {
            var sha256, moneynetwork_session_filename, wallet_session_filename;
            sha256 = CryptoJS.SHA256(self.sessionid).toString();
            moneynetwork_session_filename = sha256.substr(0, 10); // first 10 characters of sha256 signature
            wallet_session_filename = sha256.substr(sha256.length - 10); // last 10 characters of sha256 signature
            self.this_session_filename = client ? wallet_session_filename : moneynetwork_session_filename;
            self.other_session_filename = client ? moneynetwork_session_filename : wallet_session_filename;
            self.unlock_pwd2 = sha256.substr(27, 10); // for restore session. unlock pwd2 password in get_password request
            self.log(pgm, 'wallet = ' + client + ', this_session_filename = ' + self.this_session_filename + ', other_session_filename = ' + self.other_session_filename, options.group_debug_seq) ;
            cb(self.this_session_filename, self.other_session_filename, self.unlock_pwd2);
        }); // is_client
    }
}; // get_session_filenames

MoneyNetworkAPI.prototype.generate_random_string = function (length, use_special_characters) {
    var character_set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    if (use_special_characters) character_set += '![]{}#%&/()=?+-:;_-.@$|£';
    var string = [], index, char;
    for (var i = 0; i < length; i++) {
        index = Math.floor(Math.random() * character_set.length);
        char = character_set.substr(index, 1);
        string.push(char);
    }
    return string.join('');
}; // generate_random_string

// 1: JSEncrypt encrypt/decrypt using pubkey/prvkey
MoneyNetworkAPI.prototype.encrypt_1 = function (clear_text_1, options, cb) {
    var pgm = this.module + '.encrypt_1: ';
    var password, encrypt, key, output_wa, encrypted_text, encrypted_array;
    this.check_destroyed(pgm) ;
    if (!options) options = {} ;
    this.log(pgm, 'other_session_pubkey = ' + this.other_session_pubkey, options.group_debug_seq);
    if (!this.other_session_pubkey) throw pgm + 'encrypt_1 failed. pubkey is missing in encryption setup';
    encrypt = new JSEncrypt();
    encrypt.setPublicKey(this.other_session_pubkey);
    password = this.generate_random_string(100, true);
    key = encrypt.encrypt(password);
    output_wa = CryptoJS.AES.encrypt(clear_text_1, password, {format: CryptoJS.format.OpenSSL}); //, { mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.AnsiX923, format: CryptoJS.format.OpenSSL });
    encrypted_text = output_wa.toString(CryptoJS.format.OpenSSL);
    encrypted_array = [key, encrypted_text];
    cb(JSON.stringify(encrypted_array));
}; // encrypt_1
MoneyNetworkAPI.prototype.decrypt_1 = function (encrypted_text_1, options, cb) {
    var pgm = this.module + '.decrypt_1: ';
    var encrypted_array, key, encrypted_text, encrypt, password, output_wa, clear_text;
    this.check_destroyed(pgm) ;
    if (!this.this_session_prvkey) throw pgm + 'decrypt_1 failed. prvkey is missing in encryption setup';
    encrypted_array = JSON.parse(encrypted_text_1);
    key = encrypted_array[0];
    encrypted_text = encrypted_array[1];
    encrypt = new JSEncrypt();
    encrypt.setPrivateKey(this.this_session_prvkey);
    password = encrypt.decrypt(key);
    if (!password) {
        this.log(pgm, 'error. password is null. decrypt_1 failed', options.group_debug_seq) ;
        this.log(pgm, 'encrypted_text_1 = ' + encrypted_text_1, options.group_debug_seq) ;
        this.log(pgm, 'key              = ' + key, options.group_debug_seq) ;
        this.log(pgm, 'encrypted_text   = ' + encrypted_text, options.group_debug_seq) ;
        cb(null) ;
    }
    output_wa = CryptoJS.AES.decrypt(encrypted_text, password, {format: CryptoJS.format.OpenSSL}); // , { mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.AnsiX923, format: CryptoJS.format.OpenSSL });
    clear_text = output_wa.toString(CryptoJS.enc.Utf8);
    cb(clear_text)
}; // decrypt_1

// 2: cryptMessage encrypt/decrypt using ZeroNet cryptMessage plugin (pubkey2)
MoneyNetworkAPI.prototype.encrypt_2 = function (encrypted_text_1, options, cb) {
    var pgm = this.module + '.encrypt_2: ';
    var self, debug_seq0, group_debug_seq ;
    self = this;
    this.check_destroyed(pgm) ;
    if (!this.ZeroFrame) throw pgm + 'encryption failed. ZeroFrame is missing in encryption setup';
    if (!this.other_session_pubkey2) throw pgm + 'encryption failed. Pubkey2 is missing in encryption setup';
    if (!options) options = {} ;
    group_debug_seq = options.group_debug_seq ;
    // 1a. get random password
    this.log(pgm, 'encrypted_text_1 = ' + encrypted_text_1 + '. calling aesEncrypt', group_debug_seq);
    debug_seq0 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'n/a', 'aesEncrypt', null, group_debug_seq) ;
    this.ZeroFrame.cmd("aesEncrypt", [""], function (res1) {
        var pgm = self.module + '.encrypt_2 aesEncrypt callback 1: ';
        var password, debug_seq1;
        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq0, res1[0] ? 'OK' : 'Failed') ;
        password = res1[0];
        self.check_destroyed(pgm) ;
        // 1b. encrypt password
        debug_seq1 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'n/a', 'eciesEncrypt', null, group_debug_seq) ;
        self.ZeroFrame.cmd("eciesEncrypt", [password, self.other_session_pubkey2], function (key) {
            var pgm = self.module + '.encrypt_2 eciesEncrypt callback 2: ';
            var debug_seq2 ;
            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq1, key ? 'OK' : 'Failed') ;
            self.log(pgm, 'self.other_session_pubkey2 = ' + self.other_session_pubkey2 + ', key = ' + key, group_debug_seq);
            // 1c. encrypt text
            self.check_destroyed(pgm) ;
            debug_seq2 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'n/a', 'aesEncrypt', null, group_debug_seq) ;
            self.ZeroFrame.cmd("aesEncrypt", [encrypted_text_1, password], function (res3) {
                var pgm = self.module + '.encrypt_2 aesEncrypt callback 3: ';
                var iv, encrypted_text, encrypted_array, encrypted_text_2;
                MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, res3 ? 'OK' : 'Failed');
                self.log(pgm, 'aesEncrypt OK', group_debug_seq);
                // forward encrypted result to next function in encryption chain
                iv = res3[1];
                encrypted_text = res3[2];
                encrypted_array = [key, iv, encrypted_text];
                encrypted_text_2 = JSON.stringify(encrypted_array);
                self.log(pgm, 'encrypted_text_2 = ' + encrypted_text_2, group_debug_seq);
                cb(encrypted_text_2);
            }); // aesEncrypt callback 3
        }); // eciesEncrypt callback 2
    }); // aesEncrypt callback 1
}; // encrypt_2
MoneyNetworkAPI.prototype.decrypt_2 = function (encrypted_text_2, options, cb) {
    var pgm = this.module + '.decrypt_2: ';
    var self, encrypted_array, key, iv, encrypted_text, debug_seq0;
    this.check_destroyed(pgm) ;
    self = this;
    if (!this.ZeroFrame) throw pgm + 'decryption failed. ZeroFrame is missing in encryption setup';
    this.log(pgm, 'encrypted_text_2 = ' + encrypted_text_2, options.group_debug_seq);
    encrypted_array = JSON.parse(encrypted_text_2);
    key = encrypted_array[0];
    iv = encrypted_array[1];
    encrypted_text = encrypted_array[2];
    // 1a. decrypt key = password
    debug_seq0 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'eciesDecrypt', null, options.group_debug_seq) ;
    this.ZeroFrame.cmd("eciesDecrypt", [key, (this.this_session_userid2 || 0)], function (password) {
        var pgm = self.module + '.decrypt_2 eciesDecrypt callback 1: ';
        var debug_seq1 ;
        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq0, password ? 'OK' : 'Failed') ;
        // if (!password) throw pgm + 'key eciesDecrypt failed. key = ' + key + ', userid2 = ' + JSON.stringify(self.this_session_userid2 || 0);
        if (!password) {
            // no password. eciesDecrypt / decrypt_2 failed
            self.log(pgm, 'eciesDecrypt failed. no password returned. key = ' + key) ;
            return cb() ;
        }
        // 1b. decrypt encrypted_text
        debug_seq1 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'aesDecrypt', null, options.group_debug_seq) ;
        self.ZeroFrame.cmd("aesDecrypt", [iv, encrypted_text, password], function (encrypted_text_1) {
            var pgm = self.module + '.decrypt_2 aesDecrypt callback 2: ';
            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq1, encrypted_text_1 ? 'OK' : 'Failed') ;
            self.log(pgm, 'aesDecrypt OK. encrypted_text_1 = ' + encrypted_text_1, options.group_debug_seq);
            cb(encrypted_text_1);
        }); // aesDecrypt callback 2
    }); // eciesDecrypt callback 1
}; // decrypt_2

// 3: symmetric encrypt/decrypt using sessionid
MoneyNetworkAPI.prototype.encrypt_3 = function (encrypted_text_2, options, cb) {
    var pgm = this.module + '.encrypt_3: ';
    this.check_destroyed(pgm) ;
    if (!this.sessionid) throw pgm + 'encrypt_3 failed. sessionid is missing in encryption setup';
    var encrypted_text_3;
    encrypted_text_3 = MoneyNetworkAPILib.aes_encrypt(encrypted_text_2, this.sessionid);
    cb(encrypted_text_3);
}; // encrypt_3
MoneyNetworkAPI.prototype.decrypt_3 = function (encrypted_text_3, options, cb) {
    var pgm = this.module + '.decrypt_3: ';
    var encrypted_text_2;
    this.check_destroyed(pgm) ;
    if (!this.sessionid) throw pgm + 'decrypt_3 failed. sessionid is missing in encryption setup';
    encrypted_text_2 = MoneyNetworkAPILib.aes_decrypt(encrypted_text_3, this.sessionid);
    cb(encrypted_text_2)
}; // decrypt_3

// encrypt/decrypt json messages
// encryption layers: integer or array of integers: 1 JSEncrypt, 2, cryptMessage, 3 symmetric encryption
// params:
// - json: js object to be encrypted
// - options:
//   - encryption. number or array of numbers. default is [1,2,3] - 3 layers encryption
//   - group_debug_seq: track related debug info. send_message, process_incoming_message
MoneyNetworkAPI.prototype.encrypt_json = function (json, options, cb) {
    var pgm = this.module + '.encrypt_json: ';
    var self, encryption;
    this.check_destroyed(pgm) ;
    self = this;
    if (typeof cb != 'function') throw pgm + 'Invalid call. parameter 3 cb must be a callback function' ;
    if (!options) options = {} ;
    if (!options.encryptions) options.encryptions = [1,2,3] ;
    if (typeof options.encryptions == 'number') options.encryptions = [encryptions];
    if (options.encryptions.length == 0) return cb(json); // done
    encryption = options.encryptions.shift();
    if (encryption == 1) {
        this.log(pgm, 'this.other_session_pubkey = ' + this.other_session_pubkey, options.group_debug_seq);
        this.encrypt_1(JSON.stringify(json), {group_debug_seq: options.group_debug_seq}, function (encrypted_text) {
            json = {
                encryption: encryption,
                message: encrypted_text
            };
            self.encrypt_json(json, options, cb);
        });
    }
    else if (encryption == 2) {
        this.log(pgm, 'this.other_session_pubkey2 = ' + this.other_session_pubkey2, options.group_debug_seq);
        this.encrypt_2(JSON.stringify(json), {group_debug_seq: options.group_debug_seq}, function (encrypted_text) {
            json = {
                encryption: encryption,
                message: encrypted_text
            };
            self.encrypt_json(json, options, cb);
        });
    }
    else if (encryption == 3) {
        this.log(pgm, 'this.sessionid = ' + this.sessionid, options.group_debug_seq);
        this.encrypt_3(JSON.stringify(json), {group_debug_seq: options.group_debug_seq}, function (encrypted_text) {
            json = {
                encryption: encryption,
                message: encrypted_text
            };
            self.encrypt_json(json, options, cb);
        });
    }
    else {
        console.log(pgm + 'Error. Unsupported encryption ' + encryption, options.group_debug_seq);
        return cb(json);
    }
}; // encrypt_json
MoneyNetworkAPI.prototype.decrypt_json = function (json, options, cb) {
    var pgm = this.module + '.decrypt_json: ';
    var self;
    this.check_destroyed(pgm) ;
    self = this;
    if (typeof cb != 'function') throw pgm + 'Invalid call. parameter 3 cb must be a callback function' ;
    if (!options) options = {} ;
    if (!json.hasOwnProperty('encryption')) {
        if (json.msgtype != 'pubkeys') this.log(pgm, 'Warning. received unencrypted json message ' + JSON.stringify(json));
        cb(json);
    }
    else if (json.encryption == 1) {
        this.decrypt_1(json.message, {group_debug_seq: options.group_debug_seq}, function (decrypted_text) {
            var json;
            json = JSON.parse(decrypted_text);
            if (json.hasOwnProperty('encryption')) self.decrypt_json(json, options, cb);
            else cb(json); // done
        });
    }
    else if (json.encryption == 2) {
        this.decrypt_2(json.message, {group_debug_seq: options.group_debug_seq}, function (decrypted_text) {
            var next_json;
            if (!decrypted_text) {
                self.log(pgm, 'decrypt_2 failed. json.message = ' + JSON.stringify(json.message)) ;
                return cb(null) ;
            }
            next_json = JSON.parse(decrypted_text);
            if (next_json.hasOwnProperty('encryption')) self.decrypt_json(next_json, options, cb);
            else cb(next_json); // done
        });
    }
    else if (json.encryption == 3) {
        this.decrypt_3(json.message, {group_debug_seq: options.group_debug_seq}, function (decrypted_text) {
            var json;
            json = JSON.parse(decrypted_text);
            if (json.hasOwnProperty('encryption')) self.decrypt_json(json, options, cb);
            else cb(json); // done
        });
    }
    else {
        console.log(pgm + 'Unsupported encryption ' + json.encryption);
        return cb(json);
    }
}; // decrypt_json

// helper: get and write content.json file
MoneyNetworkAPI.prototype.get_content_json = function (options, cb) {
    var pgm = this.module + '.get_content_json: ';
    var self, inner_path, group_debug_seq;
    this.check_destroyed(pgm) ;
    self = this;
    if (typeof cb != 'function') throw pgm + 'invalid call. parameter 2 cb must be a callback function' ;
    if (!this.this_user_path) this.this_user_path = MoneyNetworkAPILib.get_this_user_path() ;
    if (!this.this_user_path) return cb(); // error. user_path is required
    if (!options) options = {} ;
    group_debug_seq = options.group_debug_seq ;
    inner_path = this.this_user_path + 'content.json';
    // 1: fileGet
    this.log(pgm, inner_path + ' fileGet started', group_debug_seq) ;
    MoneyNetworkAPILib.z_file_get(pgm, {inner_path: inner_path, required: false, group_debug_seq: group_debug_seq}, function (content_str) {
        var pgm = self.module + '.get_content_json fileGet callback 1: ';
        var content, json_raw;
        if (content_str) {
            content = JSON.parse(content_str);
            return cb(content);
        }
        else content = {};
        if (!self.this_optional) return cb(content); // maybe an error but optional files support was not requested
        // 2: fileWrite (empty content.json file)
        // new content.json file and optional files support requested. write + sign + get
        json_raw = unescape(encodeURIComponent(JSON.stringify(content, null, "\t")));
        MoneyNetworkAPILib.z_file_write(pgm, inner_path, btoa(json_raw), function (res) {
            var pgm = self.module + '.get_content_json fileWrite callback 2: ';
            var debug_seq2 ;
            self.log(pgm, 'res = ' + JSON.stringify(res), group_debug_seq);
            if (res != 'ok') return cb(); // error: fileWrite failed
            // 3: siteSign
            debug_seq2 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'siteSign', null, group_debug_seq);
            self.ZeroFrame.cmd("siteSign", {inner_path: inner_path}, function (res) {
                var pgm = self.module + '.get_content_json siteSign callback 3: ';
                var debug_seq3 ;
                MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res)) ;
                self.log(pgm, 'res = ' + JSON.stringify(res), group_debug_seq);
                if (res != 'ok') return cb(); // error: siteSign failed
                // 4: fileGet
                debug_seq3 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'fileGet', null, group_debug_seq) ;
                MoneyNetworkAPILib.z_file_get(pgm, {inner_path: inner_path, required: true}, function (content_str) {
                    var content;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq3, content_str ? 'OK' : 'Not found');
                    if (!content_str) return cb(); // error. second fileGet failed
                    content = JSON.parse(content_str);
                    cb(content);
                }); // fileGet callback 4
            }); // siteSign callback 3
        }); // fileWrite callback 2
    }); // fileGet callback 1
}; // get_content_json

// add optional files support to content.json file
MoneyNetworkAPI.prototype.add_optional_files_support = function (options, cb) {
    var pgm = this.module + '.add_optional_files_support: ';
    var self, group_debug_seq;
    this.check_destroyed(pgm) ;
    self = this;
    if (typeof cb != 'function') throw pgm + 'invalid call. parameter 2 cb must be a callback function' ;
    if (!this.this_optional) return cb({}); // not checked. optional files support must be added by calling code
    // check ZeroNet state279
    if (!this.ZeroFrame) return cb({error: 'Cannot add optional files support to content.json. ZeroFrame is missing in setup'});
    if (!this.ZeroFrame.site_info) return cb({error: 'Cannot add optional files support to content.json. ZeroFrame is not finished loading'});
    if (!this.ZeroFrame.site_info.cert_user_id) return cb({error: 'Cannot add optional files support to content.json. No cert_user_id. ZeroNet certificate is missing'});
    if (!this.this_user_path) this.this_user_path = MoneyNetworkAPILib.get_this_user_path() ;
    if (!this.this_user_path) return cb({error: 'Cannot add optional files support to content.json. user_path is missing in setup'});
    if (!options) options = {} ;
    group_debug_seq = options.group_debug_seq ;
    // ready for checking/adding optional files support in/to content.json file
    // 1: get content.json. will create empty signed content.json if content.json is missing
    this.get_content_json({group_debug_seq: group_debug_seq}, function (content) {
        var pgm = self.module + '.add_optional_files_support get_content_json callback 1: ';
        var inner_path, json_raw, optional_files;
        if (!content) return cb({error: 'fileGet content.json failed'});
        self.log(pgm, 'content.modified = ' + content.modified, group_debug_seq) ;
        if (content.optional == self.this_optional) {
            // optional files support already OK.
            return cb({});
        }
        // add optional files support
        self.log(pgm, 'adding optional to content.json. old optional = ' + JSON.stringify(content.optional) + ', new optional = ' + JSON.stringify(self.this_optional), group_debug_seq) ;
        content.optional = self.this_optional;
        // 2: write content.json
        inner_path = self.this_user_path + 'content.json';
        json_raw = unescape(encodeURIComponent(JSON.stringify(content, null, "\t")));
        MoneyNetworkAPILib.z_file_write(pgm, inner_path, btoa(json_raw), function(res) {
            var pgm = self.module + '.add_optional_files_support fileWrite callback 2: ';
            var debug_seq2 ;
            self.log(pgm, 'res = ' + JSON.stringify(res), group_debug_seq);
            if (res != 'ok') return cb({error: 'fileWrite failed. error = ' + res}); // error: fileWrite failed
            // 3: siteSign
            debug_seq2 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'siteSign');
            self.ZeroFrame.cmd("siteSign", {inner_path: inner_path}, function (res) {
                var pgm = self.module + '.add_optional_files_support siteSign callback 3: ';
                MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
                self.log(pgm, 'res = ' + JSON.stringify(res), group_debug_seq);
                if (res != 'ok') return cb({error: 'siteSign failed. error = ' + res}); // error: siteSign failed
                // optional files support added
                cb({});
            }); // siteSign callback 3
        }); // fileWrite callback 2
    }); // get_content_json callback 1
}; // add_optional_files_support

// send json message encrypted to other session and optional wait for response
// params:
// - json: message to send. should include a msgtype
// - options. hash with options for send_message operation
//   - response: not null. sending a request and wait for response. allowed values: null, true, false or timeout (=true) in milliseconds.
//   - timestamp: timestamp to be used in filename for outgoing message. Only used when sending response to a previous request
//   - msgtype: request msgtype. only used when sending response. Used for json validation
//   - request: request timestamp. only used when sending response. Added to response json after validation. used for offline transactions
//   - timeout_at: timestamp. only used when sending response to a previous request. other session expects response before timeout_at. cleanup response after timeout
//   - optional: session filename extension used for optional files. default found via json.msgtype => subsystem. api: i, other: e
//     i    - <session filename>-i.<timestamp> - internal API communication between MN and wallet. signed only and no distribution help is needed
//     e    - <session filename>-e.<timestamp> - external wallet to wallet communication. published. distribution help would be nice
//     o    - <session filename>-o.<timestamp> - offline wallet to wallet communication. published. distribution help would be nice.
//     io   - <session filename>-io.<timestamp> - internal and offline. offline messages between wallet and mn sessions. signed only. no distribution help is needed
//     p    - <session filename>-p.<timestamp> - internal API communication between MN and wallets. not published and no distribution help is needed (publishing messages)
//     null - <session filename>.<timestamp> - normal file. distributed to all peers. used only as a fallback option when optional file distribution fails
//   - subsystem: calling subsystem. for example api, mn or wallet. used for json schema validations
//   - group_debug_seq: use group_debug_seq from calling problem
//   - timeout_msg. text or array with timeout notification. Only used after timeout while waiting for response.
//     notification will be displayed when/if receiving a timeout message with stat about response timeout for this send_message
//     for example walet ping timeout. receive timeout message from other session. display timeout_msg in this session
//   - countdown_cb: callback function. called once every second to update spinner count down in UI
//   - todo: status: short text. update optional file with money transaction status. used by wallets. one for each wallet.

//   - todo: files object. filename => request. info about sent request. used for offline and normal files cleanup.


// - cb: callback. returns an empty hash, a hash with an error messsage or a response
// todo: how to send a message without waiting for a response and with a cleanup job. for example cleanup in 60 seconds. could be used in w2->MN ping and in timeout messages
MoneyNetworkAPI.prototype.send_message = function (request, options, cb) {
    var pgm = this.module + '.send_message: ';
    var self, response, request_msgtype, request_timestamp, encryptions, error, request_at, request_file_timestamp,
        default_timeout, timeout_at, month, year, cleanup_in, debug_seq0, subsystem, optional, group_debug_seq,
        set_error, countdown_cb, files ;
    self = this;
    this.check_destroyed(pgm) ;

    // track all console.log for this send_message call.
    if (options.group_debug_seq) group_debug_seq = options.group_debug_seq ;
    else group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start() ;
    self.log(pgm, 'Using group_debug_seq ' + group_debug_seq + ' for this ' + (request.msgtype ? 'send ' + request.msgtype + ' message': 'send_message') + ' operation', group_debug_seq);
    if (request && request.msgtype) MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {msgtype: request.msgtype});

    if (!cb) cb = function (response) {
        self.log(pgm, 'response = ' + JSON.stringify(response), group_debug_seq);
    };
    if (typeof cb != 'function') throw pgm + 'Invalid call. parameter 3 cb must be a callback function' ;

    this.log(pgm, 'sessionid = ' + this.sessionid, group_debug_seq) ;
    this.log(pgm, 'request = ' + JSON.stringify(request), group_debug_seq) ;
    request_at = new Date().getTime();

    // error wrapper. end group debug operation and return error
    set_error =  function (error) {
        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
        return cb({error: error})
    } ; // set_error

    // get params
    if (!options) options = {};
    response = options.response;
    request_file_timestamp = options.timestamp || request_at ; // timestamp - only if request json is a response to a previous request
    request_msgtype = options.msgtype; // only if request json is a response to a previous request
    request_timestamp = options.request ; // only if request json is a response to a previous request
    if (options.timeout_at) {
        // sending a response to a previous request
        if (response) return set_error(
            'Invalid call. Conflicting options. response = ' + JSON.stringify(response) + ' and timeout = ' + JSON.stringify(options.timeout_at) +
            '. please use response = number of millesconds when sending a request and please use timeout_at timestamp when sending a response to a previous request') ;
        if (typeof options.timeout_at != 'number') return set_error('Invalid call. timeout_at must be a unix timestamp') ;
    }
    encryptions = options.hasOwnProperty('encryptions') ? options.encryptions : [1, 2, 3];
    if (typeof encryptions == 'number') encryptions = [encryptions];
    subsystem = options.subsystem ;
    if (subsystem && (typeof subsystem != 'string')) return set_error('Cannot send message. options.subsystem must be a string') ;
    if (!subsystem) subsystem = MoneyNetworkAPILib.get_subsystem(request_msgtype) ;
    // use normal file or optional file (internal, external, offline etc). any file with - in filename is an optional file
    if (options.hasOwnProperty('optional')) {
        // set by calling client
        if ([null, 'i', 'e', 'o', 'io', 'p'].indexOf(options.optional) == -1) return set_error('Cannot send message. optional file extension must be null, i, e, o, io or p') ;
        if (options.optional == null) optional = '' ; // normal file
        else optional = '-' + options.optional ; // optional file
    }
    else if ((subsystem == 'api') && (['queue_publish', 'start_publish', 'check_publish', 'published'].indexOf(request.msgtype) != -1)) {
        // optional file used in special published messages between MN sessions
        optional = '-p' ;
        if ((request_msgtype == 'queue_publish') && (request.msgtype == 'start_publish')) optional = '-i' ;

    }
    else optional = subsystem == 'api' ? '-i' : '-e' ; // optional file (internal or external)
    self.log(pgm, 'msgtype = ' + request.msgtype + ', subsystem = ' + subsystem + ', optional = ' + optional, group_debug_seq) ;
    // timeout_msg
    if (options.timeout_msg) {
        // special notification to display after receiving timeout message from other session (timeout when sending this message)
        // see MoneyNetworkAPI.send_timeout_message and MoneyNetworkAPILib.debug_group_operation_receive_stat
        if (!response) return set_error('Invalid call. options.timeout_msg set and not waiting for any response') ;
        error = MoneyNetworkAPILib.validate_timeout_msg(options.timeout_msg) ;
        if (error) return set_error('invalid call. options.timeout. ' + error) ;
        MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {timeout_msg: options.timeout_msg}) ;
    }
    if (options.countdown_cb) {
        // special callback function to update remaing time before timeout in UI (spinner)
        if (!response) return set_error('Invalid call. options.countdown_cb used and not waiting for any response') ;
        if (typeof options.countdown_cb != 'function') return set_error('Invalid call. options.countdown_cb must be a callback function') ;
        countdown_cb = options.countdown_cb ;
    }
    if (options.files) {
        if (typeof options.files != 'object') return set_error('Invalid call. options.files must be an object') ;
        files = options.files ;
    }

    // check setup
    // ZeroNet state
    if (!this.ZeroFrame) return set_error('Cannot send message. ZeroFrame is missing in setup');
    if (!this.ZeroFrame.site_info) return set_error('Cannot send message. ZeroFrame is not finished loading');
    if (!this.ZeroFrame.site_info.cert_user_id) return set_error('Cannot send message. No cert_user_id. ZeroNet certificate is not selected');
    // Outgoing encryption
    if (!this.other_session_pubkey && (encryptions.indexOf(1) != -1)) return set_error('Cannot JSEncrypt encrypt outgoing message. pubkey is missing in encryption setup'); // encrypt_1
    if (!this.other_session_pubkey2 && (encryptions.indexOf(2) != -1)) return set_error('Cannot cryptMessage encrypt outgoing message. Pubkey2 is missing in encryption setup'); // encrypt_2
    if (!this.sessionid && (encryptions.indexOf(3) != -1)) return set_error('Cannot symmetric encrypt outgoing message. sessionid is missing in encryption setup'); // encrypt_3
    if (!this.this_user_path) this.this_user_path = MoneyNetworkAPILib.get_this_user_path() ;
    if (!this.this_user_path) return set_error('Cannot send message. this_user_path is missing in setup');
    if (!MoneyNetworkAPILib.is_user_path(this.this_user_path)) return set_error('Cannot send message. "' + this.this_user_path + '" is not a valid user path. Please use "merged-' + MoneyNetworkAPILib.get_merged_type() + '/<hub>/data/users/<auth_address>/" as user_path');
    if (response) {
        // Ingoing encryption
        if (!this.this_session_prvkey && (encryptions.indexOf(1) != -1) && (request.msgtype != 'get_password')) return set_error('Cannot JSEncrypt decrypt expected ingoing receipt. prvkey is missing in encryption setup'); // decrypt_1
        // decrypt_2 OK. cert_user_id already checked
        // decrypt_3 OK. sessionid already checked
    }

    // validate message. all messages are validated before send and after received
    // messages: pubkeys, save_data, get_data, delete_data
    error = MoneyNetworkAPILib.validate_json(pgm, request, request_msgtype, subsystem);
    if (error) {
        error = 'Cannot send message. ' + error;
        this.log(pgm, error);
        this.log(pgm, 'request = ' + JSON.stringify(request));
        return set_error(error);
    }
    if (request_msgtype && (typeof request_timestamp == 'number')) {
        // sending a response to a previous request.
        // add request timestamp (filename) to response json after validation
        request = JSON.parse(JSON.stringify(request)) ;
        request.request = request_timestamp ;
    }

    // response? true, false or a number (timeout in milliseconds).
    default_timeout = 10000 ;
    if (response) {
        // sending a request. wait for response. true (10 seconds) or number of milliseconds
        if (typeof response == 'number') {
            if (response < 100) response = 100 ; // timeout minimum 0.1 second
        }
        else response = default_timeout; // true = default timeout = 10 seconds
        // check for any timeout problems for this request.msgtype
        cleanup_in = response ;
        timeout_at = request_at + cleanup_in;
        year = 1000 * 60 * 60 * 24 * 365.2425;
        month = year / 12;
        // use a random timestamp 1 year ago as response filename
        response = request_at - 11 * month - Math.floor(Math.random() * month * 2); // random timestamp one year ago
        request = JSON.parse(JSON.stringify(request));
        request.response = response;
        request.timeout_at = timeout_at ;
    }
    else {
        // sending a response to a previous request
        timeout_at = options.timeout_at ;
    }

    // 1: recheck this_user_path before sending message. can have changed. user may have logged out
    debug_seq0 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'siteInfo', null, group_debug_seq) ;
    this.ZeroFrame.cmd("siteInfo", {}, function (site_info) {
        var pgm = self.module + '.send_message siteInfo callback 1: ';
        var regexp ;
        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq0, site_info ? 'OK' : 'Failed');
        if (!site_info.cert_user_id) {
            self.destroy('User log out') ;
            return set_error('invalid call. this_user_path must be null for a not logged in user') ;
        }
        regexp = new RegExp('\/' + site_info.auth_address + '\/$') ;
        if (!self.this_user_path.match(regexp)) {
            self.destroy('Changed certificate') ;
            return set_error('invalid call. auth_address in this_user_path is not correct. this_user_path = ' + self.this_user_path + '. site_info.auth_address = ' + site_info.auth_address) ;
        }
        // 2: get filenames
        self.get_session_filenames({group_debug_seq: group_debug_seq}, function (this_session_filename, other_session_filename, unlock_pwd2) {
            var pgm = self.module + '.send_message get_session_filenames callback 2: ';
            var encryptions_clone, new_response ;
            MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq,{this_session_filename: self.this_session_filename}) ;
            // this session filename is initialized. check for any previous problems with response timeout. see timeout message
            if (request.response) {
                new_response = MoneyNetworkAPILib.debug_group_operation_get_response(request.msgtype, self) ;
                if (new_response) {
                    self.log(pgm, 'previous problems with timeout for ' + request.msgtype + ', old response = ' + cleanup_in + ', new response = ' + new_response, group_debug_seq) ;
                    self.log(pgm, 'todo: add some parameter to send_message with adjust response setting. autoadjust to max response time may not by the wish from calling code') ;
                    if (new_response > cleanup_in) {
                        // adjust cleanup and timeout_at variables before sending message to other session
                        cleanup_in = new_response ;
                        timeout_at = timeout_at = request_at + cleanup_in;
                        request.timeout_at = timeout_at ;
                    }
                    self.log(pgm, 'new cleanup_in = ' + cleanup_in + ', new timeout_at = ' + timeout_at, group_debug_seq) ;
                }
            }

            // 3: encrypt json
            encryptions_clone = JSON.parse(JSON.stringify(encryptions)) ; // copy: encrypt_json updates encryptions array
            self.encrypt_json(request, {encryptions: encryptions, group_debug_seq: group_debug_seq}, function (encrypted_json) {
                var pgm = self.module + '.send_message encrypt_json callback 3: ';
                self.log(pgm, 'encrypted_json = ' + JSON.stringify(encrypted_json), group_debug_seq);

                // 4: add optional files support
                self.add_optional_files_support({group_debug_seq: group_debug_seq}, function (res) {
                    var pgm = self.module + '.send_message add_optional_files_support callback 4: ';
                    var request_filename, inner_path4, json_raw;
                    if (!res || res.error) return set_error('Cannot send message. Add optional files support failed. ' + JSON.stringify(res));
                    // 5: write file
                    request_filename = this_session_filename + optional + '.' + request_file_timestamp ;
                    inner_path4 = self.this_user_path + request_filename;
                    MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {filename: request_filename}) ;
                    json_raw = unescape(encodeURIComponent(JSON.stringify(encrypted_json, null, "\t")));
                    MoneyNetworkAPILib.z_file_write(pgm, inner_path4, btoa(json_raw), {group_debug_seq: group_debug_seq}, function (res) {
                        var pgm = self.module + '.send_message fileWrite callback 5: ';
                        var inner_path5, debug_seq5;
                        // 6: siteSign. publish not needed for within client communication
                        inner_path5 = self.this_user_path + 'content.json';
                        self.log(pgm, 'sign content.json with new optional file ' + request_filename, group_debug_seq);
                        debug_seq5 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path5, 'siteSign', null, group_debug_seq);
                        self.ZeroFrame.cmd("siteSign", {inner_path: inner_path5, remove_missing_optional: true}, function (res) {
                            var pgm = self.module + '.send_message siteSign callback 6: ';
                            var debug_seq6, sign_at, elapsed_time_ms, elapsed_time_s, elapsed_text ;
                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq5, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
                            // error handling
                            if (res && res.error && res.error.match(/too large/)) {
                                // res = {"error":"Site sign failed: Include too large 50538B > 50000B"}
                                MoneyNetworkAPILib.z_file_delete(pgm, inner_path4, function (res2) {
                                    set_error('Cannot send message. siteSign failed. ' + res.error);
                                }) ;
                                return ;
                            }
                            if (!res || res.error) return set_error('Cannot send message. siteSign failed. ' + JSON.stringify(res)) ;

                            if (!response) {
                                // no response requested for this outgoing message. end group debug operation after sign
                                // rest of message processing is only cleanup operations and not important for process communication
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, (res == 'ok' ? null : res)) ;
                            }

                            sign_at = new Date().getTime();
                            elapsed_time_ms = sign_at - request_at ;
                            elapsed_time_s = Math.round(elapsed_time_ms/1000) ;
                            elapsed_text = 'elapsed time: ' + elapsed_time_ms + ' ms / ' + elapsed_time_s + ' seconds. ' ;
                            if (timeout_at) {
                                // sending a response to a previous request
                                if (timeout_at < sign_at) {
                                    self.log(pgm, elapsed_text + 'send_message timeout. receiver will maybe reject ' + request_filename + ' response', group_debug_seq) ;
                                    // send timeout message with stat about group operations (request-response cycle elapsed time)
                                    // other process should maybe change timeout in next request
                                    self.send_timeout_message(request_msgtype) ;
                                }
                                else self.log(pgm, elapsed_text + 'timeout in ' + (timeout_at-sign_at) + ' ms', group_debug_seq) ;
                            }

                            // 7: check file_info for outgoing optional file. must be different from incoming optional files ...
                            // todo: do not check optional file info for normal files (optional = '')
                            debug_seq6 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path4, 'optionalFileInfo', null, group_debug_seq);
                            ZeroFrame.cmd("optionalFileInfo", [inner_path4], function (file_info) {
                                var pgm = self.module + '.send_message.optionalFileInfo callback 7: ';
                                var delete_request, cleanup_job_id, get_and_decrypt, response_filename, error, api_query_5, wait_for_response;
                                MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq6, file_info ? 'OK' : 'Failed');
                                // self.log(pgm, 'file_info (outgoing) = ' + JSON.stringify(file_info)) ;
                                //info_info = {
                                //    "inner_path": "data/users/18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ/b6670bccc3.1508999548065",
                                //    "uploaded": 0,
                                //    "is_pinned": 1,
                                //    "time_accessed": 0,
                                //    "site_id": 38,
                                //    "is_downloaded": 1,
                                //    "file_id": 20386,
                                //    "peer": 1,
                                //    "time_added": 1508999548,
                                //    "hash_id": 303,
                                //    "time_downloaded": 1508999548,
                                //    "size": 548
                                //};
                                // outgoing optional file:
                                // - is_pinned=1, is_downloaded=1 and time_added=time_downloaded

                                if (request.request) {
                                    self.log(pgm, 'sending a response to a previous request. start cleanup job to response. must delete response file after request timeout', group_debug_seq);
                                    cleanup_in = timeout_at - request_at;
                                    self.log(pgm, 'request_at = ' + request_at, group_debug_seq);
                                    self.log(pgm, 'timeout_at = ' + timeout_at, group_debug_seq);
                                    self.log(pgm, 'cleanup_in = ' + cleanup_in, group_debug_seq);
                                }
                                else if (timeout_at && !response) {
                                    // sending message without wait for response
                                    cleanup_in = timeout_at - (new Date().getTime()) ;
                                    if (cleanup_in < 0) cleanup_in = 0 ;
                                    self.log(pgm, 'sending a message without waiting for response. timeout_at = ' + timeout_at + ', cleanup_in = ' + cleanup_in, group_debug_seq);
                                }
                                // if ((['-o','-io'].indexOf(optional) != -1) || (!response && !request.request)) return cb({}); // exit. offline transaction or not response and no request cleanup job
                                if ((['-o','-io'].indexOf(optional) != -1) || (!response && !timeout_at)) {
                                    // exit. offline transaction or not response and cleanup was not requested
                                    // no cleanup job. return name of sent file to calling code. used in wallet cleanup function
                                    if (files) files[request_filename] = request ;
                                    return cb({}, request_filename);
                                }

                                // problem with timeout on slow running devices. timeout should be time from siteSign and not from start of send_message processing. encryption and file io can take some time on a slow running device
                                self.log(pgm, 'adding elapsed time ' + elapsed_time_ms + ' ms to cleanup_id and timeout_at', group_debug_seq) ;
                                self.log(pgm, 'old values: cleanup_in = ' + cleanup_in + ', timeout_at = ' + timeout_at, group_debug_seq) ;
                                if (cleanup_in) cleanup_in = cleanup_in + elapsed_time_ms ;
                                if (timeout_at) timeout_at = timeout_at + elapsed_time_ms ;
                                self.log(pgm, 'new values: cleanup_in = ' + cleanup_in + ', timeout_at = ' + timeout_at, group_debug_seq) ;

                                // delete request file. submit cleanup job
                                delete_request = function () {
                                    var pgm = self.module + '.send_message.delete_request: ' ;
                                    if (!cleanup_job_id) return; // already run
                                    cleanup_job_id = null;
                                    MoneyNetworkAPILib.z_file_delete(pgm, inner_path4, function (res) {
                                        var pgm = self.module + '.send_message.delete_request z_file_delete callback 1: ';
                                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                    }) ;
                                }; // delete_request
                                self.log(pgm, 'Submit delete_request job for ' + inner_path4 + '. starts delete_request job in ' + (cleanup_in || default_timeout) + ' milliseconds', group_debug_seq);
                                cleanup_job_id = setTimeout(delete_request, (cleanup_in || default_timeout));
                                if (!response) return cb({}); // exit. response was not requested. request cleanup job started

                                // fileGet and json_decrypt
                                get_and_decrypt = function (inner_path) {
                                    var pgm = self.module + '.send_message.get_and_decrypt: ';
                                    var error ;
                                    if (typeof inner_path == 'object') {
                                        self.log(pgm, 'inner_path is an object. must be a timeout error returned from MoneyNetworkAPILib.wait_for_file function. inner_path = ' + JSON.stringify(inner_path), group_debug_seq);
                                        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'Timeout. ' + request.msgtype + ' response was not received') ;
                                        return cb(inner_path);
                                    }
                                    //if (timeout_at) {
                                    //    now = new Date().getTime();
                                    //    self.log(pgm, 'todo: fileGet: add timeout to fileGet call. required must also be false. now = ' + now + ', timeout_at = ' + new Date().getTime() + ', timeout = ' + (timeout_at - now));
                                    //}
                                    MoneyNetworkAPILib.z_file_get(pgm, {inner_path: inner_path, required: true, group_debug_seq: group_debug_seq}, function (response_str, extra) {
                                        var pgm = self.module + '.send_message.get_and_decrypt fileGet callback 8.1: ';
                                        var encrypted_response, error, request_timestamp;
                                        if (!response_str) {
                                            error = 'fileGet for receipt failed' ;
                                            self.log(pgm, error, group_debug_seq) ;
                                            self.log(pgm, 'request = ' + JSON.stringify(request)) ;
                                            self.log(pgm, 'extra   = ' + JSON.stringify(extra)) ;
                                            return set_error(error);
                                        }
                                        encrypted_response = JSON.parse(response_str);
                                        self.log(pgm, 'encrypted_response = ' + response_str + ', sessionid = ' + self.sessionid, group_debug_seq);
                                        // read response. run cleanup job now
                                        if (cleanup_job_id) {
                                            clearTimeout(cleanup_job_id);
                                            setTimeout(delete_request, 0);
                                        }
                                        // decrypt response
                                        self.decrypt_json(encrypted_response, {group_debug_seq: group_debug_seq}, function (response) {
                                            var pgm = self.module + '.send_message.get_and_decrypt decrypt_json callback 8.2: ';
                                            // remove request timestamp before validation
                                            request_timestamp = response.request;
                                            delete response.request;
                                            // validate response
                                            error = MoneyNetworkAPILib.validate_json(pgm, response, request.msgtype, subsystem);
                                            if (!error && (request_timestamp != request_file_timestamp)) {
                                                // difference between timestamp in request filename and request timestamp in response!
                                                error = 'Expected request = ' + request_file_timestamp + ', found request = ' + request_timestamp;
                                            }
                                            if (error) response.request = request_timestamp;
                                            if (error) {
                                                error = request.msgtype + ' response is not valid. ' + error;
                                                self.log(pgm, error, group_debug_seq);
                                                self.log(pgm, 'request = ' + JSON.stringify(request), group_debug_seq);
                                                self.log(pgm, 'response = ' + JSON.stringify(response), group_debug_seq);
                                                return set_error(error);
                                            }

                                            // return decrypted response
                                            self.log(pgm, 'response = ' + JSON.stringify(response) +
                                                ', request_timestamp = ' + request_timestamp +
                                                ', request_file_timestamp = ' + request_file_timestamp, group_debug_seq);

                                            // end group debug operation. cb will do something with response. Maybe a new request-response cycle?
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            cb(response);
                                        }); // decrypt_json callback 8.2
                                    }); // fileGet callback 8.1
                                }; // get_and_decrypt

                                // normally request and response uses same optional file type.
                                // only exception is publish messages. request uses optional = '-p' and response uses optional = '-i'
                                response_filename = other_session_filename + (optional == '-p' ? '-i' : optional) + '.' + response;

                                // 8: is MoneyNetworkAPIDemon monitoring incoming messages for this sessionid?
                                if (MoneyNetworkAPILib.is_session(self.sessionid)) {
                                    // demon is running and is monitoring incoming messages for this sessionid
                                    self.log(pgm, 'demon is running. wait for response file ' + response_filename + '. cb = get_and_decrypt', group_debug_seq);
                                    error = MoneyNetworkAPILib.wait_for_file(response_filename, {request: request, timeout_at: timeout_at, cb: get_and_decrypt, countdown_cb: countdown_cb});
                                    if (error) return set_error(error);
                                }
                                else {
                                    // demon is not running or demon is not monitoring this sessionid

                                    // 7: wait for response. loop. wait until timeout_at
                                    if (optional == '') api_query_5 =
                                        "select 'merged-" + MoneyNetworkAPILib.get_merged_type() + "/' || json.directory || '/'   ||  files.filename as inner_path " +
                                        "from files, json " +
                                        "where files.filename = '" + response_filename + "' " +
                                        "and json.json_id = files.json_id";
                                    else api_query_5 =
                                        "select 'merged-" + MoneyNetworkAPILib.get_merged_type() + "/' || json.directory || '/'   ||  files_optional.filename as inner_path " +
                                        "from files_optional, json " +
                                        "where files_optional.filename = '" + response_filename + "' " +
                                        "and json.json_id = files_optional.json_id";
                                    self.log(pgm, 'api query 5 = ' + api_query_5, group_debug_seq) ;

                                    // loop
                                    wait_for_response = function (last_countdown) {
                                        var pgm = self.module + '.send_message.wait_for_response 8: ';
                                        var now, debug_seq8;
                                        now = new Date().getTime();
                                        if (now > timeout_at) {
                                            self.log(pgm, 'Timeout while waiting for ' + request.msgtype + ' response', group_debug_seq) ;
                                            self.log(pgm, 'request was ' + JSON.stringify(request), group_debug_seq) ;
                                            self.log(pgm, 'request filename was ' + inner_path4, group_debug_seq) ;
                                            self.log(pgm, 'expected response filename was ' + response_filename, group_debug_seq) ;
                                            if (countdown_cb && last_countdown) countdown_cb(0) ;
                                            return set_error('Timeout while waiting for ' + request.msgtype + ' response');
                                        }
                                        // 9: dbQuery
                                        debug_seq8 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'api query 5', 'dbQuery', null, group_debug_seq);
                                        self.ZeroFrame.cmd("dbQuery", [api_query_5], function (res) {
                                            var pgm = self.module + '.send_message.wait_for_receipt dbQuery callback 9: ';
                                            var inner_path9, call_countdown_cb, countdown, wait_for_response_with_countdown;
                                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq8, (!res || res.error) ? 'Failed' : 'OK');
                                            if (res.error) return set_error('Wait for receipt failed. Json message was ' + JSON.stringify(request) + '. dbQuery error was ' + res.error);
                                            if (!res.length) {
                                                if (countdown_cb) {
                                                    call_countdown_cb = false ;
                                                    countdown = Math.round((timeout_at - now) / 1000) ;
                                                    if (typeof last_countdown == 'number') {
                                                        if (countdown != last_countdown) call_countdown_cb = true ;
                                                    }
                                                    else call_countdown_cb = true ;
                                                    if (call_countdown_cb) countdown_cb(countdown) ;
                                                }
                                                wait_for_response_with_countdown = function() {
                                                    wait_for_response(countdown) ;
                                                };
                                                setTimeout(wait_for_response_with_countdown, 500);
                                                return;
                                            }
                                            inner_path9 = res[0].inner_path;
                                            // 10: get_and_decrypt
                                            get_and_decrypt(inner_path9);

                                        }); // dbQuery callback 9
                                    }; // wait_for_response callback 8
                                    setTimeout(wait_for_response, 250);
                                }

                            }); // optionalFileInfo callback 8

                        }); // siteSign callback 7 (content.json)

                    }); // writeFile callback 5 (request)
                }); // add_optional_files_support callback 4
            }); // encrypt_json callback 3
        }); // get_filenames callback 2
    }); // siteInfo callback 1

}; // send_message

// report timeout problems to other process. other process may retry failed request or display a timeout message in UI
// params:
// - optional msgtype if request had a valid msgtype
// - optional notification. text or array with type, message and timeout (wrapperNotofication)
MoneyNetworkAPI.prototype.send_timeout_message = function(msgtype, notification) {
    var pgm = this.module + '.send_timeout_message: ';
    var self, group_debug_seq, pos, notification_type, notification_message, notification_timeout, stat, request, timeout_at, stat ;
    self = this;
    this.check_destroyed(pgm) ;
    stat = MoneyNetworkAPILib.debug_group_operation_get_stat(this) ;
    if (!stat.length) {
        this.log(pgm, 'Skipping timeout_message. No new process information was found in group_debug_operations') ;
        return ;
    }
    group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start() ;
    this.log(pgm, 'Using group_debug_seq ' + group_debug_seq + ' for this send timeout message operation', group_debug_seq);
    if (msgtype && (typeof msgtype != 'string')) throw pgm + 'invalid call. parameter 1 msgtype must be a string' ;
    if (notification) {
        if (typeof notification == 'string') {
            // OK
            notification_type = 'info' ;
            notification_message = notification ;
            notification_timeout = null ;
        }
        else if (!Array.isArray(notification)) throw pgm + 'invalid call. parameter 2 notification must be a string or an array' ;
        else if ((notification.length < 2) || (notification.length > 3)) throw pgm + 'invalid call. parameter 2 notification array must have 2 or 3 elements' ;
        else {
            notification_type = notification[0] ;
            notification_message = notification[1] ;
            notification_timeout = notification[2] ;
            if (['info', 'error', 'done'].indexOf(notification_type) == -1) throw pgm + 'invalid call. parameter 2 notification type must be info, error or done' ;
            if (typeof notification_message != 'string') throw pgm + 'invalid call. parameter 2 notification message must be a string' ;
            if (notification_timeout && (typeof notification_timeout != 'number')) throw pgm + 'invalid call. parameter 2 notification timeout must be a number' ;
        }
    }

    // build timeout request
    request = { msgtype: 'timeout' } ;
    if (notification) {
        request.nofication = {
            type: notification_type,
            message: notification_message
        } ;
        if (notification_timeout) request.nofication.timeout = notification_timeout ;
    }
    request.stat = stat ;
    //request = {
    //    "msgtype": "timeout",
    //    "stat": [
    //        {"msgtype": "get_password", "start_at": 1510661637134, "finish_at": 1510661649178},
    //        {"msgtype": "ping", "start_at": 1510661649256, "finish_at": 1510661656342, "error": "Timeout. ping response was not received"},
    //        {"msgtype": "get_balance", "start_at": 1510661650740, "finish_at": 1510661651344},
    //        {"msgtype": "get_balance", "start_at": 1510661650761, "finish_at": 1510661651428},
    //        {"msgtype": "ping", "start_at": 1510661705180, "finish_at": 1510661721579}
    //    ]
    //};

    // send timeout message. do not wait for responce. cleanup in 60 seconds
    timeout_at = new Date().getTime() + 60000 ;
    this.send_message(request, {timeout_at: timeout_at, group_debug_seq: group_debug_seq}, function (response) {
        var pgm = self.module + '.send_timeout_message send_message callback 1: ';
        self.log(pgm, 'response = ' + JSON.stringify(response), group_debug_seq) ;
    }) ; // send_message callback 1

}; // send_timeout_message

// ask message_demon to reprocess an already done incoming message. Used as fallback in case of lost messages or messages arriving in wrong order
MoneyNetworkAPI.prototype.redo_file = function(request_filename) {
    var pgm = this.module + '.redo_file: ';
    var self;
    self = this;
    this.check_destroyed(pgm);
    this.get_session_filenames({}, function(this_session_filename, other_session_filename, unlock_pwd2) {
        var pgm = self.module + '.redo_file get_session_filenames callback: ';
        var lng ;
        lng = other_session_filename.length ;
        if (request_filename.substr(0,lng) != other_session_filename) return 'Invalid request_filename path. Expected path to start with ' + other_session_filename ;
        return MoneyNetworkAPILib.redo_file(request_filename) ;
    }) ; // get_session_filenames callback
}; // redo_file


// end MoneyNetworkAPI class