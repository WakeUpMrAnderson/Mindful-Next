module.exports = {
    blockSave: {
        shortcut: function(ev){
            return ev.keyCode === 83;
        },
        execute: function (tagName) {
            document.documentElement.classList.add('author');
            document.documentElement.classList.remove('focus');
            let author = document.querySelector('.mindful-toggle--author');
            let content = author.innerHTML;

            author.innerHTML = 'Mindful saves automatically ♥︎';
            setTimeout(()=>{
                document.documentElement.classList.remove('author');
                document.documentElement.classList.remove('focus');
                setTimeout(()=>{
                    author.innerHTML = content;
                }, 350);
            }, 2000);
        },
        queryState: function (tagName) {
        }
    }
}
