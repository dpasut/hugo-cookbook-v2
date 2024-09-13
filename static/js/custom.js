var searchTerm = null;

summaryInclude = 60;
var fuseOptions = {
  shouldSort: true,
  includeMatches: true,
  threshold: 0.0,
  tokenize: true,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 1,
  keys: [
    { name: "title", weight: 0.8 },
    { name: "contents", weight: 0.5 },
    { name: "tags", weight: 0.3 },
    { name: "categories", weight: 0.3 }
  ]
};

u('#searchTerm').on('change keyup', function () { // Set the search value on keyup for the input
  searchTerm = this.value;
});

function showAlert(message) {
  u('#alert').removeClass("d-none"); // Bootstrap uses d-none for hiding
  u('#alert').html(message).addClass("alert alert-danger"); // Adding Bootstrap alert classes
  setTimeout(function () {
    u('#alert').addClass("d-none");
  }, 3000);
}

u('#searchButton').handle('click', function (e) { // use handle to automatically prevent default
  if (searchTerm) {
    u("#searchTerm").text(searchTerm);
    u('#searchButton').addClass("spinner-border spinner-border-sm"); // Bootstrap loading spinner
    executeSearch(searchTerm);
  } else {
    showAlert("Search cannot be empty!");
  }
});

function executeSearch(searchQuery) {
  fetch(window.hugoBaseURL + "/index.json").then(r => r.json()).then(function (data) {
    var pages = data;
    var fuse = new Fuse(pages, fuseOptions);
    var result = fuse.search(searchQuery);
    if (result.length > 0) {
      u('#content').addClass("d-none"); // Hiding main content to display the results
      u('#searchResults').children(u('div')).empty(); // clean out any previous search results
      u('#searchButton').removeClass("spinner-border"); // Remove loading spinner
      u('#searchResults').removeClass("d-none"); // Show result area
      populateResults(result);
    } else {
      showAlert("No results found!");
      u('#searchButton').removeClass("spinner-border");
      u("#searchTerm").text("");
    }
  });
}

function populateResults(result) {
  Object.entries(result).forEach(entry => {
    const [key, value] = entry;
    var contents = value.item.contents;
    var snippet = "";
    var snippetHighlights = [];
    var tags = [];
    if (fuseOptions.tokenize) {
      snippetHighlights.push(searchTerm);
    } else {
      value.matches.forEach(function (matchKey, mvalue) {

        if (mvalue.key == "tags" || mvalue.key == "categories") {
          snippetHighlights.push(mvalue.value);
        } else if (mvalue.key == "contents") {
          start = mvalue.indices[0][0] - summaryInclude > 0 ? mvalue.indices[0][0] - summaryInclude : 0;
          end = mvalue.indices[0][1] + summaryInclude < contents.length ? mvalue.indices[0][1] + summaryInclude : contents.length;
          snippet += contents.substring(start, end);
          snippetHighlights.push(mvalue.value.substring(mvalue.indices[0][0], mvalue.indices[0][1] - mvalue.indices[0][0] + 1));
        }
      });
    }

    if (snippet.length < 1) {
      snippet += contents.substring(0, summaryInclude * 2);
    }
    // pull template from hugo template definition
    var templateDefinition = u('#search-result-template').html();
    // replace values
    var output = render(templateDefinition, { key: key, title: value.item.title, link: value.item.permalink, tags: value.item.tags, categories: value.item.categories, snippet: snippet, image: value.item.imageLink });
    u('#searchResultsCol').append(output);
  });
}

function param(name) {
  return decodeURIComponent((location.search.split(name + '=')[1] || '').split('&')[0]).replace(/\+/g, ' ');
}

function render(templateString, data) {
  var conditionalMatches, conditionalPattern, copy;
  conditionalPattern = /\$\{\s*isset ([a-zA-Z]*) \s*\}(.*)\$\{\s*end\s*}/g;
  // since loop below depends on re.lastIndex, we use a copy to capture any manipulations whilst inside the loop
  copy = templateString;
  while ((conditionalMatches = conditionalPattern.exec(templateString)) !== null) {
    if (data[conditionalMatches[1]]) {
      // valid key, remove conditionals, leave contents.
      copy = copy.replace(conditionalMatches[0], conditionalMatches[2]);
    } else {
      // not valid, remove entire section
      copy = copy.replace(conditionalMatches[0], '');
    }
  }
  templateString = copy;
  // now any conditionals removed, we can do simple substitution
  var key, find, re;
  for (key in data) {
    find = '\\$\\{\\s*' + key + '\\s*\\}';
    re = new RegExp(find, 'g');
    templateString = templateString.replace(re, data[key]);
  }
  return templateString;
}
