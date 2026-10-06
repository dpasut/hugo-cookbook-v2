var summaryInclude = 60;
var searchDebounceMs = 250;
var minQueryLength = 2;

var fuseOptions = {
  shouldSort: true,
  includeMatches: true,
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: "title", weight: 0.8 },
    { name: "contents", weight: 0.5 },
    { name: "tags", weight: 0.3 },
    { name: "categories", weight: 0.3 }
  ]
};

var fusePromise = null; // cached index + Fuse instance, fetched once
var debounceTimer = null;
var lastQuery = null;

function getSearchTerm() {
  var input = u('#searchTerm').first();
  return input ? input.value.trim() : '';
}

function getFuse() {
  if (!fusePromise) {
    var baseURL = window.hugoBaseURL.endsWith('/') ? window.hugoBaseURL : window.hugoBaseURL + '/';
    fusePromise = fetch(baseURL + "index.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Search index request failed: " + response.status);
        }
        return response.json();
      })
      .then(function (pages) {
        return new Fuse(pages, fuseOptions);
      })
      .catch(function (error) {
        fusePromise = null; // allow a retry on the next search
        throw error;
      });
  }
  return fusePromise;
}

// Live search while typing (input also covers paste, cut, and autofill)
u('#searchTerm').on('input', function () {
  updateClearButtonVisibility();
  var query = getSearchTerm();
  clearTimeout(debounceTimer);
  if (query.length === 0) {
    hideSearchResults();
    return;
  }
  if (query.length < minQueryLength) {
    return;
  }
  debounceTimer = setTimeout(function () {
    executeSearch(query);
  }, searchDebounceMs);
});

// Handle the form so pressing Enter searches instead of reloading the page
u('#searchForm').handle('submit', function () {
  clearTimeout(debounceTimer);
  var query = getSearchTerm();
  if (query) {
    executeSearch(query);
  } else {
    showAlert("Search cannot be empty!");
  }
});

// Allow Escape to clear the search from the input
u('#searchTerm').on('keydown', function (e) {
  if (e.key === 'Escape') {
    clearSearch();
  }
});

function updateClearButtonVisibility() {
  var hasText = getSearchTerm().length > 0;
  var hasResults = !u('#searchResults').hasClass('d-none');
  if (hasText || hasResults) {
    u('#clearSearchButton').removeClass('d-none');
  } else {
    u('#clearSearchButton').addClass('d-none');
  }
}

function hideSearchResults() {
  lastQuery = null;
  u('#searchResults').addClass('d-none');
  u('#content').removeClass('d-none');
  u('#searchResultsCol').empty();
  updateClearButtonVisibility();
}

function clearSearch() {
  clearTimeout(debounceTimer);
  var input = u('#searchTerm').first();
  if (input) {
    input.value = '';
  }
  hideSearchResults();
}

u('#clearSearchButton').handle('click', function () {
  clearSearch();
  var input = u('#searchTerm').first();
  if (input) {
    input.focus();
  }
});

function showAlert(message) {
  u('#alert').removeClass("d-none"); // Bootstrap uses d-none for hiding
  u('#alert').html(message).addClass("alert alert-danger"); // Adding Bootstrap alert classes
  setTimeout(function () {
    u('#alert').addClass("d-none");
  }, 3000);
}

function executeSearch(searchQuery) {
  if (searchQuery === lastQuery) {
    return; // nothing changed since the last search
  }
  getFuse().then(function (fuse) {
    if (searchQuery !== getSearchTerm()) {
      return; // input changed while the index was loading
    }
    lastQuery = searchQuery;
    var result = fuse.search(searchQuery);
    u('#content').addClass("d-none"); // Hide main content to display the results
    u('#searchResultsCol').empty(); // Clean out any previous search results
    u('#searchResults').removeClass("d-none"); // Show result area
    if (result.length > 0) {
      u('#searchResultsHeading').text('Search results for “' + searchQuery + '” (' + result.length + ')');
      populateResults(result, searchQuery);
    } else {
      u('#searchResultsHeading').text('Search results');
      u('#searchResultsCol').append(
        '<div class="col-12"><p class="text-muted">No recipes found for “' +
        escapeHtml(searchQuery) + '”.</p></div>'
      );
    }
    updateClearButtonVisibility();
  }).catch(function () {
    showAlert("Search is unavailable right now. Please try again.");
  });
}

function populateResults(result, searchQuery) {
  var templateDefinition = u('#search-result-template').html();
  var allOutput = '';
  result.forEach(function (value, key) {
    var contents = value.item.contents || '';
    var snippet = '';

    if (value.matches) {
      // Use the longest content match for the most relevant snippet
      var bestMatch = null;
      value.matches.forEach(function (match) {
        if (match.key === "contents" && match.indices && match.indices.length > 0) {
          match.indices.forEach(function (indices) {
            if (!bestMatch || (indices[1] - indices[0]) > (bestMatch[1] - bestMatch[0])) {
              bestMatch = indices;
            }
          });
        }
      });
      if (bestMatch) {
        var start = Math.max(bestMatch[0] - summaryInclude, 0);
        var end = Math.min(bestMatch[1] + summaryInclude, contents.length);
        snippet = (start > 0 ? '…' : '') +
          contents.substring(start, end) +
          (end < contents.length ? '…' : '');
      }
    }

    if (snippet.length < 1) {
      snippet = contents.substring(0, summaryInclude * 2);
      if (contents.length > snippet.length) {
        snippet += '…';
      }
    }

    var output = render(templateDefinition, {
      key: key,
      title: value.item.title,
      link: value.item.permalink,
      tags: value.item.tags,
      categories: value.item.categories,
      snippet: snippet,
      image: value.item.imageLink,
      imageWidth: value.item.imageWidth || 512,
      imageHeight: value.item.imageHeight || 512
    }, searchQuery);
    allOutput += output;
  });
  u('#searchResultsCol').append(allOutput);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wrap occurrences of the query terms in <mark> (input must already be escaped)
function highlightTerms(escapedText, searchQuery) {
  if (!searchQuery) {
    return escapedText;
  }
  var terms = searchQuery.trim().split(/\s+/).filter(function (term) {
    return term.length >= minQueryLength;
  });
  if (terms.length === 0) {
    return escapedText;
  }
  var pattern = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'gi');
  return escapedText.replace(pattern, '<mark>$1</mark>');
}

function render(templateString, data, searchQuery) {
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
  // now any conditionals removed, we can do simple substitution (escaped to prevent HTML injection)
  templateString = templateString.replace(/\$\{\s*(\w+)\s*\}/g, function (match, key) {
    if (!(key in data) || data[key] == null) {
      return '';
    }
    var escaped = escapeHtml(data[key]);
    if (key === 'title' || key === 'snippet') {
      return highlightTerms(escaped, searchQuery);
    }
    return escaped;
  });
  return templateString;
}
