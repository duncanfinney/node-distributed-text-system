
[![Build Status](https://travis-ci.org/duncanfinney/node-distributed-text-system.svg?branch=master)](https://travis-ci.org/duncanfinney/node-distributed-text-system) 
[![Coverage Status](https://coveralls.io/repos/github/duncanfinney/node-distributed-text-system/badge.svg?branch=master)](https://coveralls.io/github/duncanfinney/node-distributed-text-system?branch=master)
## Description
My solution to the code challenge explained at the bottom of this readme

## Running
```
yarn install
node --harmony index.js [config.json] [port]
```

## Implementation Details

- This repository implements a version of the raft protocol `raft/raft.js` ([specification](https://raft.github.io/)) 
- Clients access the raft state via the basic http server in `http/http-serve.js`
  - Server to client push implemented with SSE ([specfication](https://www.w3.org/TR/2009/WD-eventsource-20091029/))
  - Client POST requests are held open until the data has been committed to the raft cluster.
- There are **two** entry points for the app
  - `index.js` - Simple text logging
  - `index-blessed.js` - Adds an informative status bar at the bottom using [blessed](https://github.com/chjj/blessed)

## Cluster Membership
- Implemented via MQTT published as `{ retain: true, qos: 2 }`
- When a node joins the cluster, it publishes to `nodes/id/status` a payload of `online`
- The Last Will and Testament message is to to publish `nodes/id/status` a payload of `offline`
- Every client subscribes to `nodes/#`

## Screenshot
![Imgur](http://i.imgur.com/eMlJQCc.gif)

----
## Challenge: NodeJS Distributed Text System

You will be implementing a limited distributed text editor that is designed to operate across multiple servers. The requirements for your solution are:

- An arbitrary number of servers can be started
- Each server needs to be started by invoking the same script (ex: text_server.js)
- The server script takes two command line arguments
    * The name of a JSON file to read its configuration from (this configuration is shared by all servers)
    * The port number for the server to listen on (unique to each server)
- The shared server configuration consists of:
    * The location of the "initial text" to use in the editor, in the case the server is the first started.
      This "initial text" should be stored in file, the configuration value should reference the location of the file
    * The MQTT server connection configuration (more on MQTT further down)
- Changes in text values and all state changes are to be disrtibuted between servers using MQTT 
    * MQTT is a simple messaging broker, if it is unfamiliar to you please see: http://forkbomb-blog.de/2015/all-you-need-to-know-about-mqtt 
    * You must use the 'mqtt' module for node (npm install mqtt)
- Text contents need to be updated on every keystroke
    * All editors in any connected client should always show the same text after every keystroke
- Text editor contents need to be persistent.
    * If a server is started and is the first and only server, the "initial text" should be loaded from the configured location
      and its content should be exactly the same as the what was in the last editor at the point all servers were shut down.
      In essence, the shared state should persist across a shutdown of all the servers.
    * If a server is restarted and other servers are already running , clients connecting to the server should see the same contents as those connected to other servers
- The text editor UI should be served at the URI: /editor
- The ONLY direct dependency you may use is the "mqtt" module mentioned above. One exception may be the use of socket.io but your solution
  will be judged as superior without the dependency. There are no dependency resrictions for any browser-side code

- UI Requirements/Features
    * The "text editor" can consist of a simple HTML text area
    * You can assume that only one user "owns" the editor at a given time. There is no requirement to implement locking or deal with concurrency-related matters
    
- You must write automated testing to the degree you see fit

- You can use the MQTT server at this location for your work (or any other you choose): broker.hivemq.com

Your solution will be evaluated using several criteria:

- Overall design (modularity, decomposition, Object-Oriented design)
- The depth, coverage and quality of the tesing
- Code quality (readability, maintainability and correctness)
- Ability to handle edge cases and errors

