var styles = require('./notification.scss');


function Notification() {}
Notification.prototype.init = function(editor){
    editor.on('notify', this.show.bind(this));
}
Notification.prototype.createMarkup = function(){
    this.hostEl = document.createElement('div');
    this.hostEl.innerHTML = `<div class="notification__content">${this.config.text}</div><div class="notification__button">${this.config.button}</div>`;
    this.hostEl.classList.add('notification');

    this.buttonEl   = this.hostEl.querySelector('.notification__button');
    this.contentEl  = this.hostEl.querySelector('.notification__content');
}

Notification.prototype.show = function(data){
    this.config = {...{
        'text': 'Hello…',
        'id': false,
        'button': 'Got it!',
        'callback': (function(){}),
    }, ...data};
    // generate scoped markup
    this.createMarkup();

    if(localStorage.getItem('n'+data.id) !== 'true' || !this.config.id){
        this.hostEl.classList.add('show');
        document.querySelector('aside').appendChild(this.hostEl);
    }

    this.buttonEl.addEventListener('click', ()=>{
        if(this.config.id){
            localStorage.setItem('n'+data.id, 'true');
        }
        // button micro-interactions
        this.buttonEl.classList.add('active');
        this.hostEl.classList.remove('show');
        // execute callback function
        this.config.callback();
    });
}
module.exports = Notification;
