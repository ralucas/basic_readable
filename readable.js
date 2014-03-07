var readable = {
    iframeLoads:             0,
    convertLinksToFootnotes: false,
    reversePageScroll:       false, /* If they hold shift and hit space, scroll up */
    frameHack:               false, /**
                                      * The frame hack is to workaround a firefox bug where if you
                                      * pull content out of a frame and stick it into the parent element, the scrollbar won't appear.
                                      * So we fake a scrollbar in the wrapping div.
                                     **/
    biggestFrame:            false,
    bodyCache:               null,   /* Cache the body HTML in case we need to re-use it later */
    flags:                   0x1 | 0x2 | 0x4,   /* Start with all flags set. */

    /* constants */
    FLAG_STRIP_UNLIKELYS:     0x1,
    FLAG_WEIGHT_CLASSES:      0x2,
    FLAG_CLEAN_CONDITIONALLY: 0x4,

    maxPages:    30, /* The maximum number of pages to loop through before we call it quits and just show a link. */
    parsedPages: {}, /* The list of pages we've parsed in this call of readable, for autopaging. As a key store for easier searching. */
    pageETags:   {}, /* A list of the ETag headers of pages we've parsed, in case they happen to match, we'll know it's a duplicate. */
    pageScraped: {},

    /**
     * All of the regular expressions in use within readable.
     * Defined up here so we don't instantiate them repeatedly in loops.
     **/
    regexps: {
        unlikelyCandidates:    /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter/i,
        okMaybeItsACandidate:  /and|article|body|column|main|shadow/i,
        positive:              /article|body|content|entry|hentry|main|page|pagination|post|text|blog|story/i,
        negative:              /combx|comment|com-|contact|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget/i,
        extraneous:            /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single/i,
        divToPElements:        /<(a|blockquote|dl|div|img|ol|p|pre|table|ul)/i,
        replaceBrs:            /(<br[^>]*>[ \n\r\t]*){2,}/gi,
        replaceFonts:          /<(\/?)font[^>]*>/gi,
        trim:                  /^\s+|\s+$/g,
        normalize:             /\s{2,}/g,
        killBreaks:            /(<br\s*\/?>(\s|&nbsp;?)*){1,}/g,
        videos:                /http:\/\/(www\.)?(youtube|vimeo)\.com/i,
        skipFootnoteLink:      /^\s*(\[?[a-z0-9]{1,2}\]?|^|edit|citation needed)\s*$/i,
        nextLink:              /(next|weiter|continue|>([^\|]|$)|»([^\|]|$))/i, // Match: next, continue, >, >>, » but not >|, »| as those usually mean last.
        prevLink:              /(prev|earl|old|new|<|«)/i
    },

    flagIsActive: function(flag) {
        return (readable.flags & flag) > 0;
    },
    
    addFlag: function(flag) {
        readable.flags = readable.flags | flag;
    },
    
    removeFlag: function(flag) {
        readable.flags = readable.flags & ~flag;
    },
    /**
     * Get the inner text of a node - cross browser compatibly.
     * This also strips out any excess whitespace to be found.
     *
     * @param Element
     * @return string
    **/
    getInnerText: function (e, normalizeSpaces) {
        var textContent    = "";

        if(typeof(e.textContent) === "undefined" && typeof(e.innerText) === "undefined") {
            return "";
        }

        normalizeSpaces = (typeof normalizeSpaces === 'undefined') ? true : normalizeSpaces;

        if (navigator.appName === "Microsoft Internet Explorer") {
            textContent = e.innerText.replace( readable.regexps.trim, "" ); }
        else {
            textContent = e.textContent.replace( readable.regexps.trim, "" ); }

        if(normalizeSpaces) {
            return textContent.replace( readable.regexps.normalize, " "); }
        else {
            return textContent; }
    },
     /**
     * Get an elements class/id weight. Uses regular expressions to tell if this 
     * element looks good or bad.
     *
     * @param Element
     * @return number (Integer)
    **/
    getClassWeight: function (e) {
        if(!readable.flagIsActive(readable.FLAG_WEIGHT_CLASSES)) {
            return 0;
        }

        var weight = 0;

        /* Look for a special classname */
        if (typeof(e.className) === 'string' && e.className !== '')
        {
            if(e.className.search(readable.regexps.negative) !== -1) {
                weight -= 25; }

            if(e.className.search(readable.regexps.positive) !== -1) {
                weight += 25; }
        }

        /* Look for a special ID */
        if (typeof(e.id) === 'string' && e.id !== '')
        {
            if(e.id.search(readable.regexps.negative) !== -1) {
                weight -= 25; }

            if(e.id.search(readable.regexps.positive) !== -1) {
                weight += 25; }
        }

        return weight;
    },
    /**
     * Get the density of links as a percentage of the content
     * This is the amount of text that is inside a link divided by the total text in the node.
     * 
     * @param Element
     * @return number (float)
    **/
    getLinkDensity: function (e) {
        var links      = e.getElementsByTagName("a");
        var textLength = readable.getInnerText(e).length;
        var linkLength = 0;
        for(var i=0, il=links.length; i<il;i+=1)
        {
            linkLength += readable.getInnerText(links[i]).length;
        }       

        return linkLength / textLength;
    },
    /**
     * Initialize a node with the readable object. Also checks the
     * className/id for special names to add to its score.
     *
     * @param Element
     * @return void
    **/
    initializeNode: function (node) {
        node.readable = {"contentScore": 0};         

        switch(node.tagName) {
            case 'DIV':
                node.readable.contentScore += 5;
                break;

            case 'PRE':
            case 'TD':
            case 'BLOCKQUOTE':
                node.readable.contentScore += 3;
                break;
                
            case 'ADDRESS':
            case 'OL':
            case 'UL':
            case 'DL':
            case 'DD':
            case 'DT':
            case 'LI':
            case 'FORM':
                node.readable.contentScore -= 3;
                break;

            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6':
            case 'TH':
                node.readable.contentScore -= 5;
                break;
        }
       
        node.readable.contentScore += readable.getClassWeight(node);
    },
    
    /***
     * grabArticle - Using a variety of metrics (content score, classname, element types), find the content that is
     *               most likely to be the stuff a user wants to read. Then return it wrapped up in a div.
     *
     * @param page a document to run upon. Needs to be a full document, complete with body.
     * @return Element
    **/
    grabArticle: function (page) {
        var stripUnlikelyCandidates = readable.flagIsActive(readable.FLAG_STRIP_UNLIKELYS),
            isPaging = (page !== null) ? true: false;

        page = page ? page : document.body;

        var pageCacheHtml = page.innerHTML;

        var allElements = page.getElementsByTagName('*');

        /**
         * First, node prepping. Trash nodes that look cruddy (like ones with the class name "comment", etc), and turn divs
         * into P tags where they have been used inappropriately (as in, where they contain no other block level elements.)
         *
         * Note: Assignment from index for performance. See http://www.peachpit.com/articles/article.aspx?p=31567&seqNum=5
         * TODO: Shouldn't this be a reverse traversal?
        **/
        var node = null;
        var nodesToScore = [];
        var nodesToRemove = [];
        var newNodes = [];
        var childNodes =[];
        var nodeIndex;
        var nodesToAppend = [];
        var articleObject = {};
        for(nodeIndex = 0; nodeIndex < allElements.length; nodeIndex+=1) {
            node = allElements[nodeIndex];
            // Remove unlikely candidates
            if (stripUnlikelyCandidates) {
                var unlikelyMatchString = node.className + node.id;

                if ( (unlikelyMatchString.search(readable.regexps.unlikelyCandidates) !== -1 &&
                    unlikelyMatchString.search(readable.regexps.okMaybeItsACandidate) === -1 &&
                    node.tagName !== "BODY") ) 
                {
                        nodesToRemove.push(node);
                }
                          
            }
        }
        for(nodeIndex = 0; nodeIndex < allElements.length; nodeIndex+=1) {
            node = allElements[nodeIndex];
            if (node.tagName === "P" || node.tagName === "TD" || node.tagName === "PRE") {
                nodesToScore[nodesToScore.length] = node;
            }
        }
        for(nodeIndex = 0; nodeIndex < allElements.length; nodeIndex+=1) {
            node = allElements[nodeIndex];
             // Turn all divs that don't have children block level elements into p's 
            if (node.tagName === "DIV") {
                if (node.innerHTML.search(readable.regexps.divToPElements) === -1) {
                    var newNode = document.createElement('p');
                    try {
                        newNode.innerHTML = node.innerHTML;             
                        //node.parentNode.replaceChild(newNode, node);
                        node = newNode;
                        newNodes.push(node);
                        nodesToScore[nodesToScore.length] = node;
                        continue;
                    }
                    catch(e) {
                        console.log(e);
                    }
                }
                else
                {
                    // EXPERIMENTAL 
                    for(var i = 0, il = node.childNodes.length; i < il; i+=1) {
                        var childNode = node.childNodes[i];
                        if(childNode.nodeType === 3) { // Node.TEXT_NODE
                            var p = document.createElement('p');
                            p.innerHTML = childNode.nodeValue;
                            p.style.display = 'inline';
                            p.className = 'readable-styled';
                            childNode = p;
                            //childNode.parentNode.replaceChild(p, childNode);
                            childNodes.push(childNode);
                        }
                    }
                }
            } 
        }
        //console.log('ntr: ', nodesToRemove, 'nn: ', newNodes, 'cn: ', childNodes);

        // *
        //  * Loop through all paragraphs, and assign a score to them based on how content-y they look.
        //  * Then add their score to their parent node.
        //  *
        //  * A score is determined by things like number of commas, class names, etc. Maybe eventually link density.
        // *
        var candidates = [];
        for (var pt=0; pt < nodesToScore.length; pt+=1) {
            var parentNode      = nodesToScore[pt].parentNode;
            var grandParentNode = parentNode ? parentNode.parentNode : null;
            var innerText       = readable.getInnerText(nodesToScore[pt]);

            if(!parentNode || typeof(parentNode.tagName) === 'undefined') {
                continue;
            }

             // If this paragraph is less than 25 characters, don't even count it. 
            if(innerText.length < 25) {
                continue; }

             // Initialize readable data for the parent. 
            if(typeof parentNode.readable === 'undefined') {
                readable.initializeNode(parentNode);
                candidates.push(parentNode);
            }

             // Initialize readable data for the grandparent. 
            if(grandParentNode && typeof(grandParentNode.readable) === 'undefined' && typeof(grandParentNode.tagName) !== 'undefined') {
                readable.initializeNode(grandParentNode);
                candidates.push(grandParentNode);
            }

            var contentScore = 0;

             // Add a point for the paragraph itself as a base. 
            contentScore+=1;

             // Add points for any commas within this paragraph 
            contentScore += innerText.split(',').length;
            
             // For every 100 characters in this paragraph, add another point. Up to 3 points. 
            contentScore += Math.min(Math.floor(innerText.length / 100), 3);
            
             // Add the score to the parent. The grandparent gets half. 
            parentNode.readable.contentScore += contentScore;

            if(grandParentNode) {
                grandParentNode.readable.contentScore += contentScore/2;             
            }
        }

        // *
        //  * After we've calculated scores, loop through all of the possible candidate nodes we found
        //  * and find the one with the highest score.
        // *
        var topCandidate = null;
        for(var c=0, cl=candidates.length; c < cl; c+=1)
        {
            // *
            //  * Scale the final candidates score based on link density. Good content should have a
            //  * relatively small link density (5% or less) and be mostly unaffected by this operation.
            // *
            candidates[c].readable.contentScore = candidates[c].readable.contentScore * (1-readable.getLinkDensity(candidates[c]));

            if(!topCandidate || candidates[c].readable.contentScore > topCandidate.readable.contentScore) {
                topCandidate = candidates[c]; }
        }

        // *
        //  * If we still have no top candidate, just use the body as a last resort.
        //  * We also have to copy the body node so it is something we can modify.
        //  *
        if (topCandidate === null || topCandidate.tagName === "BODY")
        {
            topCandidate = document.createElement("DIV");
            topCandidate.innerHTML = page.innerHTML;
            page.innerHTML = "";
            //page.appendChild(topCandidate);
            readable.initializeNode(topCandidate);
        }

        // *
        //  * Now that we have the top candidate, look through its siblings for content that might also be related.
        //  * Things like preambles, content split by ads that we removed, etc.
        // *
        var articleContent        = document.createElement("DIV");
        if (isPaging) {
            articleContent.id     = "readable-content";
        }
        var siblingScoreThreshold = Math.max(10, topCandidate.readable.contentScore * 0.2);
        var siblingNodes;
        
        if(topCandidate.parentNode) {
            siblingNodes = topCandidate.parentNode.childNodes;
        } else {
            siblingNodes = topCandidate.childNodes;
        }
        


        for(var s=0, sl=siblingNodes.length; s < sl; s+=1) {
            var siblingNode = siblingNodes[s];
            var append      = false;

            // *
            //  * Fix for odd IE7 Crash where siblingNode does not exist even though this should be a live nodeList.
            //  * Example of error visible here: http://www.esquire.com/features/honesty0707
            // *
            if(!siblingNode) {
                continue;
            }

            if(siblingNode === topCandidate)
            {
                append = true;
            }

            var contentBonus = 0;
             // Give a bonus if sibling nodes and top candidates have the example same classname 
            if(siblingNode.className === topCandidate.className && topCandidate.className !== "") {
                contentBonus += topCandidate.readable.contentScore * 0.2;
            }

            if(typeof siblingNode.readable !== 'undefined' && (siblingNode.readable.contentScore+contentBonus) >= siblingScoreThreshold)
            {
                append = true;
            }
            
            if(siblingNode.nodeName === "P") {
                var linkDensity = readable.getLinkDensity(siblingNode);
                var nodeContent = readable.getInnerText(siblingNode);
                var nodeLength  = nodeContent.length;
                
                if(nodeLength > 80 && linkDensity < 0.25)
                {
                    append = true;
                }
                else if(nodeLength < 80 && linkDensity === 0 && nodeContent.search(/\.( |$)/) !== -1)
                {
                    append = true;
                }
            }

            if(append) {

                var nodeToAppend = null;
                if(siblingNode.nodeName !== "DIV" && siblingNode.nodeName !== "P") {
                    // We have a node that isn't a common block level element, like a form or td tag. Turn it into a div so it doesn't get filtered out later by accident.
                    
                    nodeToAppend = document.createElement("DIV");
                    try {
                        nodeToAppend.id = siblingNode.id;
                        nodeToAppend.innerHTML = siblingNode.innerHTML;
                    }
                    catch(er) {
                        nodeToAppend = siblingNode;
                        s-=1;
                        sl-=1;
                    }
                } else {
                    nodeToAppend = siblingNode;
                    s-=1;
                    sl-=1;
                }
                
                 // To ensure a node does not interfere with readable styles, remove its classnames 
                nodeToAppend.className = "";

                 // Append sibling and subtract from our list because it removes the node when you append to another node 
                //articleContent.appendChild(nodeToAppend);
                nodesToAppend.push(nodeToAppend);
            }
        }
        // console.log('nta', nodesToAppend);

        articleObject.htmlToDisplay = nodesToAppend[0].innerHTML;
        articleObject.page_text = nodesToAppend[0].innerText;

        // for(var j = 0; j < nodesToAppend.length; j++){
        //     articleObject.htmlToDisplay += nodesToAppend[j].innerHTML;
        //     articleObject.page_text += nodesToAppend[j].innerText;
        //     // console.log('t', nodesToAppend[j].innerHTML);
        //     // console.log('t', nodesToAppend[j].innerText);
        // }
        // *
        //  * So we have all of the content that we need. Now we clean it up for presentation.
        // *
        //readable.prepArticle(articleContent);
        console.log('nta', nodesToAppend);
        return articleObject;
        /*
        if (readable.curPageNum === 1) {
            articleContent.innerHTML = '<div id="readable-page-1" class="page">' + articleContent.innerHTML + '</div>';
        }

        // *
        //  * Now that we've gone through the full algorithm, check to see if we got any meaningful content.
        //  * If we didn't, we may need to re-run grabArticle with different flags set. This gives us a higher
        //  * likelihood of finding the content, and the sieve approach gives us a higher likelihood of
        //  * finding the -right- content.
        // *
        if(readable.getInnerText(articleContent, false).length < 250) {
        page.innerHTML = pageCacheHtml;

            if (readable.flagIsActive(readable.FLAG_STRIP_UNLIKELYS)) {
                readable.removeFlag(readable.FLAG_STRIP_UNLIKELYS);
                return readable.grabArticle(page);
            }
            else if (readable.flagIsActive(readable.FLAG_WEIGHT_CLASSES)) {
                readable.removeFlag(readable.FLAG_WEIGHT_CLASSES);
                return readable.grabArticle(page);
            }
            else if (readable.flagIsActive(readable.FLAG_CLEAN_CONDITIONALLY)) {
                readable.removeFlag(readable.FLAG_CLEAN_CONDITIONALLY);
                return readable.grabArticle(page);
            } else {
                return null;
            }
        }
        console.log('nta', nodesToAppend);
        return nodesToAppend;
        //return articleObject;
        //return articleContent;
        */
    }
};