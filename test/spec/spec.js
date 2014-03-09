describe("readable", function() {

    describe('html', function() {
        jasmine.getFixtures().fixturesPath = './html';
        loadFixtures('techcrunch.html');
        var techcrunch = $('html').html();
        
        it('should be a string', function() {
            expect(typeof techcrunch).toBe('string');
        });

    });

});