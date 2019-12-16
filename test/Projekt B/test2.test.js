describe('testSuiteA', () => {
    describe('test1()', () => {
        it('should run this test', () => {
            expect(true).toBe(true);
        });
    });
    
    it('should run this test', () => {
        expect(true).toBe(true);
    });

    describe('test2', () => {
        it('should run this test', () => {
            expect(true).toBe(true);
        });

        describe('test3', () => {
            it('should run this test 3', () => {
                expect(true).toBe(true);
            });
        });
    });
});


describe('testSuiteB', () => {
    it('lol', () => {
        expect(true).toBe(true);
    });
});