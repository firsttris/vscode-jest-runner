const findLine = (selectedLine, children) => {
    if(!children){
        return;
    }
    for(const element of children) {
        if(element.start.line === selectedLine) {
            return element.name;
        }
    }
    for(const element of children) {
        const result = findLine(selectedLine, element.children);
        if (result) {
            return element.name + ' ' + result;
        }
    }
}

module.exports = findLine;