describe("readable", function() {

  jasmine.getFixtures().fixturesPath = './html';

  loadFixtures('techcrunch.html');

  var techcrunch = $('html').html();

  it('should return true to having html snippet', function() {
    expect(techcrunch).toContainHtml('<div class="block-small">');
  });


});