const socketPub = require('zeromq').socket("pub");
const socketSub = require('zeromq').socket("sub");
const sqlite3 = require('sqlite3').verbose();
const readLine = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const users = [
    {
        email: 'first@gmail.com',
        passw: '1234'
    },
    {
        email: 'second@gmail.com',
        passw: '0000'
    }];

const db = new sqlite3.Database('mydb.db', (err)=> {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to SQLite database.');
        askPort();
    }
});



const dbSerialize = ()=> {
  db.serialize(()=>{
     db.run('CREATE TABLE if not exists user(email TEXT, passw TEXT)');
     db.all('SELECT * from user', (err, rows)=>{
         if (rows.length === 0) {
             const dbInsert = db.prepare('INSERT INTO user(email, passw) VALUES (?, ?)');
             users.forEach((user)=>{
                dbInsert.run(user.email, user.passw);
             });
             dbInsert.finalize();
         }
     });
  });
};

const checkPassw = (pwd, email, msg_id)=> {
    db.serialize(()=>{
        db.all('SELECT rowid AS id, * FROM user WHERE passw = "'+pwd+'" AND email = "'+email+'"', (err, rows)=> {
            if (rows && rows.length > 0) {
               request(msg_id, null, rows[0].id);
            } else {
                request( msg_id, 'WRONG_PWD');
            }
        });
    });
};

const request = (msg_id, err, id)=> {
    let req =  {msg_id};
    if (id) {
        req.status = 'ok';
        req.user_id = `${id}`;
    }
    else {
        req.msg_id = msg_id;
        req.status = 'error';
        req.error = err;
    }
    const stringifyRequest = JSON.stringify(req);
    socketPub.send(['api_out', stringifyRequest])
};


const zeroMQConnect = (subPort, pubPort)=> {
    socketPub.bindSync(`tcp://127.0.0.1:${pubPort}`);
    socketSub.connect(`tcp://127.0.0.1:${subPort}`);
    console.log('Published bound to port', pubPort);
    console.log('Subscribe connected to port', subPort);
    socketSub.subscribe('api_in');
    dbSerialize();

    socketSub.on('message', (topic, message)=> {
        const form = JSON.parse(message);
        if (form.type && form.type.trim() !== '' && form.type === 'login' &&
            form.email && form.email.trim() !== '' &&
            form.msg_id && form.msg_id.trim() !== '' &&
            form.pwd && form.pwd.trim() !== '') {
            checkPassw(form.pwd, form.email, form.msg_id);
        } else {
            request(form.msg_id, 'WRONG_FORMAT');
        }
    });
};

const askPort = ()=> {
    let pubPort;
    let subPort;

    readLine.question('Please enter pub port => ', answer => {
        console.log('Pub port is:', answer);
        pubPort = +answer;
        readLine.question('Please enter sub port => ', answer => {
            console.log('Sub port is:', answer);
            subPort = +answer;
            if (typeof subPort === "number" && typeof pubPort === "number") {
                zeroMQConnect(subPort, pubPort);
            } else {
                console.error('Enter correct port!');
                askPort();
            }
        });
    });
};



