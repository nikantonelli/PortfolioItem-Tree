(function () {
    var Ext = window.Ext4 || window.Ext;

Ext.define('Rally.apps.PortfolioItemTree.app', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    config: {
        defaultSettings: {
            keepTypesAligned: true
        }
    },
    getSettingsFields: function() {
        var returned = [
        {
            name: 'keepTypesAligned',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Columnised Types',
            labelAlign: 'top'
        },
        {
            name: 'hideArchived',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Hide Archived',
            labelAlign: 'top'
        }
        ];
        return returned;
    },
    itemId: 'rallyApp',
        MIN_COLUMN_WIDTH:   200,        //Looks silly on less than this
        MIN_ROW_HEIGHT: 20 ,                 //
        LOAD_STORE_MAX_RECORDS: 100, //Can blow up the Rally.data.wsapi.filter.Or
        WARN_STORE_MAX_RECORDS: 300, //Can be slow if you fetch too many
        NODE_CIRCLE_SIZE: 8,                //Pixel radius of dots
        LEFT_MARGIN_SIZE: 100,               //Leave space for "World view" text
        STORE_FETCH_FIELD_LIST:
            [
                'Name',
                'FormattedID',
                'Parent',
                'DragAndDropRank',
                'Children',
                'ObjectID',
                'Project',
                'DisplayColor',
                'Owner',
                'Blocked',
                'BlockedReason',
                'Ready',
                'Tags',
                'Workspace',
                'RevisionHistory',
                'CreationDate',
                'PercentDoneByStoryCount',
                'PercentDoneByStoryPlanEstimate',
                'State',
                'PreliminaryEstimate',
                'Description',
                'Notes',
                'Predecessors',
                'Successors',
                'OrderIndex',   //Used to get the State field order index
                //Customer specific after here. Delete as appropriate
                'c_ProjectIDOBN',
                'c_QRWP',
                'c_RAGStatus',
                'c_ProgressUpdate'
            ],
        CARD_DISPLAY_FIELD_LIST:
            [
                'Name',
                'Owner',
                'PreliminaryEstimate',
                'Parent',
                'Project',
                'PercentDoneByStoryCount',
                'PercentDoneByStoryPlanEstimate',
                'State',
                'c_ProjectIDOBN',
                'c_QRWP',
                'c_RAGStatus'

            ],

    items: [
        {
            xtype: 'container',
            itemId: 'rootSurface',
            margin: '5 5 5 5',
            layout: 'auto',
            title: 'Loading...',
            autoEl: {
                tag: 'svg'
            },
            listeners: {
                afterrender:  function() {  gApp = this.up('#rallyApp'); gApp._onElementValid(this);},
            },
            visible: false
        }
    ],
    //Set the SVG area to the surface we have provided
    _setSVGSize: function(surface) {
        var svg = d3.select('svg');
        svg.attr('width', surface.getEl().dom.clientWidth);
        svg.attr('height',surface.getEl().dom.clientHeight);
    },
    _nodeTree: null,
    //Continuation point after selectors ready/changed
    _enterMainApp: function() {

        gApp._initialiseD3();
        //Get all the nodes and the "Unknown" parent virtual nodes
        var nodetree = gApp._createTree(gApp._nodes);

        //It is hard to calculate the exact size of the tree so we will guess here
        //When we try to use a 'card' we will need the size of the card

        var numColumns = gApp._getSelectedOrdinal()+1; //Leave extras for offset at left and text at right??
        var columnWidth = this.getSize().width/numColumns;
        columnWidth = columnWidth > gApp.MIN_COLUMN_WIDTH ? columnWidth : gApp.MIN_COLUMN_WIDTH;
        treeboxHeight = (nodetree.leaves().length +1) * gApp.MIN_ROW_HEIGHT;

        var viewBoxSize = [columnWidth*numColumns, treeboxHeight];

        //Make surface the size available in the viewport (minus the selectors and margins)
        var rs = this.down('#rootSurface');
        rs.getEl().setWidth(viewBoxSize[0]);
        rs.getEl().setHeight(viewBoxSize[1]);
        //Set the svg area to the surface
        this._setSVGSize(rs);
        // Set the dimensions in svg to match
        var svg = d3.select('svg');
        svg.attr('class', 'rootSurface');
        svg.attr('preserveAspectRatio', 'none');
        svg.attr('viewBox', '0 0 ' + viewBoxSize[0] + ' ' + (viewBoxSize[1]+ gApp.NODE_CIRCLE_SIZE));

        gApp._nodeTree = nodetree;      //Save for later
        g = svg.append("g")        .attr("transform","translate(" + gApp.LEFT_MARGIN_SIZE + ",10)");
        //For the size, the tree is rotated 90degrees. Height is for top node to deepest child
        var tree = null;
        if (this.getSetting('keepTypesAligned')) {
            tree = d3.tree()
                .size([viewBoxSize[1], viewBoxSize[0] - (columnWidth + (2*gApp.LEFT_MARGIN_SIZE))])     //Take off a chunk for the text??
                .separation( function(a,b) {
                        return ( a.parent == b.parent ? 1 : 1); //All leaves equi-distant
                    }
                );
        }
        else {
             tree = d3.cluster()
                .size([viewBoxSize[1], viewBoxSize[0] - (columnWidth + (2*gApp.LEFT_MARGIN_SIZE))])     //Take off a chunk for the text??
                .separation( function(a,b) {
                        return ( a.parent == b.parent ? 1 : 1); //All leaves equi-distant
                    }
                );
        }
        tree(nodetree);
        gApp.tree = tree;
        gApp._refreshTree();
    },
    _refreshTree: function(){
        var g = d3.select('g');
        var nodetree = gApp._nodeTree;

         g.selectAll(".link")
            .data(nodetree.descendants().slice(1))
            .enter().append("path")
            .attr("class", function(d) { return d.data.invisibleLink? "invisible--link" :  "local--link" ;})
            .attr("d", function(d) {
                    return "M" + d.y + "," + d.x
                        + "C" + (d.parent.y + 100) + "," + d.x
                        + " " + (d.parent.y + 100) + "," + d.parent.x
                        + " " + d.parent.y + "," + d.parent.x;
            })
            ;
        var node = g.selectAll(".node")
            .data(nodetree.descendants())
            .enter().append("g")
            .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

        //We're going to set the colour of the dot depndent on some criteria (in this case only  'State'
        node.append("circle")
            .attr("r", gApp.NODE_CIRCLE_SIZE)
            .attr("class", function (d) {   //Work out the individual dot colour
                var lClass = "dotOutline"; // Might want to use outline to indicate something later
                if (d.data.record.data.ObjectID){
                    if (!d.data.record.get('State')) return "error--node";      //Not been set - which is an error in itself
                    lClass +=  ' q' + ((d.data.record.get('State').OrderIndex-1) + '-' + gApp._highestOrdinal()); //We wouldn't expect more than 5, but if so, repeat
                } else {
                    return d.data.error ? "error--node": "no--errors--done";
                }
                return lClass;
            })
            .on("click", function(node, index, array) { gApp._nodeClick(node,index,array);})
            .on("mouseover", function(node, index, array) { gApp._nodeMouseOver(node,index,array);})
            .on("mouseout", function(node, index, array) { gApp._nodeMouseOut(node,index,array);});

        node.append("text")
              .attr("dy", 3)
              .attr("visible", false)
              .attr("x", function(d) { return gApp._textXPos(d);})
              .attr("y", function(d) { return gApp._textYPos(d);})
//              .style("text-anchor", "start" )
              .style("text-anchor",  function(d) { return gApp._textAnchor(d);})
              .text(function(d) {  return d.children?d.data.Name : d.data.Name + ' ' + (d.data.record && d.data.record.data.Name); });

        //Now put in, but hide, all the dependency links
//        node.addPredecessors(g.selectAll("circle"));
//        node.addSuccessors();
    },

    _textXPos: function(d){
        return d.children ? -(gApp.NODE_CIRCLE_SIZE + 5) : (gApp.NODE_CIRCLE_SIZE + 5);
    },

    _textYPos: function(d){
        return (d.children  && d.parent) ? -(gApp.NODE_CIRCLE_SIZE + 5) : 0;
    },

    _textAnchor: function(d){
//        if (d.children && d.parent) return 'middle';
        if (!d.children && d. parent) return 'start';
        return 'end';
    },

    _nodeMouseOut: function(node, index,array){
        if (node.card) node.card.hide();
    },

    _nodeMouseOver: function(node,index,array) {
        if (!(node.data.record.data.ObjectID)) {
            //Only exists on real items, so do something for the 'unknown' item
            return;
        } else {

            if ( !node.card) {
                var card = Ext.create('Rally.ui.cardboard.Card', {
                    'record': node.data.record,
                    fields: gApp.CARD_DISPLAY_FIELD_LIST,
                    constrain: false,
                    width: gApp.MIN_COLUMN_WIDTH,
                    height: 'auto',
                    floating: true,
                    shadow: false,
                    showAge: true,
                    resizable: true
                });
                node.card = card;
            }
            node.card.show();
        }
    },

    _nodeClick: function (node,index,array) {
        if (!(node.data.record.data.ObjectID)) return; //Only exists on real items
        //Get ordinal (or something ) to indicate we are the lowest level, then use "UserStories" instead of "Children"
        var childField = node.data.record.hasField('Children')? 'Children' : 'UserStories';
        var model = node.data.record.hasField('Children')? node.data.record.data.Children._type : 'UserStory';

        Ext.create('Rally.ui.dialog.Dialog', {
            autoShow: true,
            draggable: true,
            closable: true,
            width: 1200,
            height: 600,
                    overflowY: 'scroll',
                    overflowX: 'none',
            record: node.data.record,
            disableScroll: false,
            model: model,
            childField: childField,
            title: 'Information for ' + node.data.record.get('FormattedID') + ': ' + node.data.record.get('Name'),
            layout: 'hbox',
            items: [
                {
                    xtype: 'container',
                    itemId: 'leftCol',
                    width: 600,
//                    overflowY: 'scroll',
//                    overflowX: 'none'
                },
                {
                    xtype: 'container',
                    itemId: 'rightCol',
                    width: '50%'
                }
            ],
//            items: [
//                {
//                        xtype: 'rallycard',
//                        record: node.data.record,
//                        fields: gApp.CARD_DISPLAY_FIELD_LIST,
//                        showAge: true,
//                        resizable: true
//                },
//                {
//                    xtype: 'text',
//                    text: 'Last Weekly Update Entry: '
//                },
//                {
//                    xtype: 'rallytextfield',
//                    readOnly: true,
//                    blankText: 'No Update Available',
//                    autoScroll: true,
//                    width:600,
//                    height: 200,
//                    value: node.data.record.get('c_ProgressUpdate')
//                },
//                {
//                    xtype: 'rallypopoverchilditemslistview',
//                    target: array[index],
//                    record: node.data.record,
//                    childField: field,
//                    addNewConfig: null,
//                    gridConfig: {
//                        title: 'Children of ' + node.data.record.data.FormattedID,
//                        enableEditing: false,
//                        enableRanking: false,
//                        enableBulkEdit: false,
//                        showRowActionsClumn: false,
//                        columnCfgs : [
//                            'FormattedID',
//                            'Name',
//    //                        'Owner',
//                            'PercentDoneByStoryCount',
//                            'PercentDoneByStoryPlanEstimate',
//                            'State',
//                            'c_RAGSatus'
//                        ]
//                    },
//                    model: model
//                }
//            ],
            listeners: {
                afterrender: function() {
                    this.down('#leftCol').add(
                        {
                                xtype: 'rallycard',
                                record: this.record,
                                fields: gApp.CARD_DISPLAY_FIELD_LIST,
                                showAge: true,
                                resizable: true
                        },

                        {
                            xtype: 'rallypopoverchilditemslistview',
                            target: array[index],
                            record: this.record,
                            childField: this.childField,
                            addNewConfig: null,
                            gridConfig: {
                                title: 'Children:',
                                enableEditing: false,
                                enableRanking: false,
                                enableBulkEdit: false,
                                showRowActionsColumn: false,
                                storeConfig: this.nonRAIDStoreConfig(),
                                columnCfgs : [
                                    'FormattedID',
                                    'Name',
                                    'PercentDoneByStoryCount',
                                    'PercentDoneByStoryPlanEstimate',
                                    'State',
                                    'c_RAGSatus',
                                    'ScheduleState'
                                ]
                            },
                            model: this.model
                        }
                    );

                    if ( this.record.get('c_ProgressUpdate')){
                        this.down('#leftCol').insert(1,
                            {
                                xtype: 'component',
                                width:this.width,
                                autoScroll: true,
                                maxHeight: 80,
                                html: this.record.get('c_ProgressUpdate')
                            }
                        );
                        this.down('#leftCol').insert(1,
                            {
                                xtype: 'text',
                                text: 'Progress Update: ',
                                margin: '0 0 10 0'
                            }
                        );
                    }
                    //This is specific to customer. Features are used as RAIDs as well.
                    if ((this.record.self.ordinal === 1) && this.record.get('c_RAIDType')){
                        this.down('#leftCol').add(
                            {
                                xtype: 'rallypopoverchilditemslistview',
                                target: array[index],
                                record: this.record,
                                childField: this.childField,
                                addNewConfig: null,
                                gridConfig: {
                                    title: 'Risks and Issues:',
                                    enableEditing: false,
                                    enableRanking: false,
                                    enableBulkEdit: false,
                                    showRowActionsColumn: false,
                                    storeConfig: this.RAIDStoreConfig(),
                                    columnCfgs : [
                                        'FormattedID',
                                        'Name',
                                        'c_RAIDType',
                                        'State',
                                        'c_RAGStatus',
                                        'ScheduleState'
                                    ]
                                },
                                model: this.model
                            }
                        );
                    }
                    var cfd = Ext.create('Rally.apps.CFDChart', {
                        record: this.record,
                        container: this.down('#rightCol')
                    });
//                    this.down('#rightCol').add( cfd );
                    cfd.generateChart();

                    //Now add predecessors and successors
                    this.down('#rightCol').add(
                        {
                            xtype: 'rallypopoverchilditemslistview',
                            target: array[index],
                            record: this.record,
                            childField: 'Predecessors',
                            addNewConfig: null,
                            gridConfig: {
                                title: 'Predecessors:',
                                enableEditing: false,
                                enableRanking: false,
                                enableBulkEdit: false,
                                showRowActionsColumn: false,
                                storeConfig: this.RAIDStoreConfig(),
                                columnCfgs : [
                                'FormattedID',
                                'Name',
                                'PercentDoneByStoryCount',
                                'PercentDoneByStoryPlanEstimate',
                                'State',
                                'c_RAGSatus',
                                'ScheduleState'
                                ]
                            },
                            model: this.model
                        }
                    );
                    this.down('#rightCol').add(
                        {
                            xtype: 'rallypopoverchilditemslistview',
                            target: array[index],
                            record: this.record,
                            childField: 'Successors',
                            addNewConfig: null,
                            gridConfig: {
                                title: 'Successors: ',
                                enableEditing: false,
                                enableRanking: false,
                                enableBulkEdit: false,
                                showRowActionsColumn: false,
                                storeConfig: this.RAIDStoreConfig(),
                                columnCfgs : [
                                'FormattedID',
                                'Name',
                                'PercentDoneByStoryCount',
                                'PercentDoneByStoryPlanEstimate',
                                'State',
                                'c_RAGSatus',
                                'ScheduleState'
                                ]
                            },
                            model: this.model
                        }
                    );

                }
            },

            //This is specific to customer. Features are used as RAIDs as well.
            nonRAIDStoreConfig: function() {
                if (this.record.hasField('c_RAIDType') ){
                    switch (this.record.self.ordinal) {
                        case 1:
                            return  {
                                filters: {
                                    property: 'c_RAIDType',
                                    operator: '=',
                                    value: ''
                                }
                            };
                        default:
                            return {};
                    }
                }
                else return {};
            },

            //This is specific to customer. Features are used as RAIDs as well.
            RAIDStoreConfig: function() {
                var retval = {};

                if (this.record.hasField('c_RAIDType') && this.record.hasField('c_RAGStatus')){
                            return {
                                filters: [{
                                    property: 'c_RAIDType',
                                    operator: '!=',
                                    value: ''
                                },
                                {
                                    property: 'c_RAGStatus',
                                    operator: '=',
                                    value: 'RED'
                                }]
                            };
                    }
                    else return {};
                }
            });
    },

    //Entry point after creation of render box
    _onElementValid: function(rs) {

        //Add any useful selectors into this container ( which is inserted before the rootSurface )
        //Choose a point when all are 'ready' to jump off into the rest of the app
        var hdrBox = this.insert (0,{
            xtype: 'container',
            itemId: 'headerBox',
            layout: 'hbox',
            items: [
                {
                    xtype: 'container',
                    itemId: 'filterBox'
                },
                {
                    xtype:  'rallyportfolioitemtypecombobox',
                    itemId: 'piType',
                    fieldLabel: 'Choose Portfolio Type :',
                    labelWidth: 100,
                    margin: '5 0 5 20',
                    defaultSelectionPosition: 'first',
//                    storeConfig: {
//                        sorters: {
//                            property: 'Ordinal',
//                            direction: 'ASC'
//                        }
//                    },
                    listeners: {
                        select: function() { gApp._kickOff();},    //Jump off here to add portfolio size selector
                        ready: function() { gApp._addColourHelper(); }
                    }
                },
            ]
        });
    },

    _addColourHelper: function() {
        var hdrBox = gApp.down('#headerBox');
        var numColours = gApp._highestOrdinal() + 1;
        var modelList = gApp._getTypeList(numColours);  //Doesn't matter if we are one over here.
//        debugger;
        //Get the SVG surface and add a new group
        var svg = d3.select('svg');
        var colours = svg.append("c")    //New group for colours
                .attr("transform","translate(" + gApp.LEFT_MARGIN_SIZE + ",10)");
        _.each(modelList, function(modeltype) {
            var 
            colours.appendChild(
        });
    },

    _nodes: [],

    _kickOff: function() {
        var ptype = gApp.down('#piType');
        var hdrBox = gApp.down('#headerBox');
        gApp._typeStore = ptype.store;
        var selector = gApp.down('#itemSelector');
        if ( selector) {
            selector.destroy();
        }
        hdrBox.add({
            xtype: 'rallyartifactsearchcombobox',
            fieldLabel: 'Choose Start Item :',
            itemId: 'itemSelector',
            labelWidth: 100,
            queryMode: 'remote',
            pageSize: 25,
            width: 600,
            margin: '5 0 5 20',
            storeConfig: {
                models: [ 'portfolioitem/' + ptype.rawValue ],
                fetch: gApp.STORE_FETCH_FIELD_LIST
            },
            listeners: {
                select: function(selector,store) {
                    if ( gApp._nodes) gApp._nodes = [];
                    gApp._getArtifacts(store);
                }
            }
        });

//        gApp._getArtifacts(ptype);
    },


    _getArtifacts: function(data) {
        //On re-entry send an event to redraw

        gApp._nodes = gApp._nodes.concat( gApp._createNodes(data));    //Add what we started with to the node list

        this.fireEvent('redrawTree');
        //Starting with highest selected by the combobox, go down

        _.each(data, function(record) {
            if (record.get('Children')){                                //Limit this to feature level and not beyond.
                collectionConfig = {
                    fetch: gApp.STORE_FETCH_FIELD_LIST,
                    callback: function(records, operation, success) {
                        //Start the recursive trawl down through the levels
                        if (records.length)  gApp._getArtifacts(records);
                    }
                };
                if (gApp.getSetting('hideArchived')) {
                    collectionConfig.filters = [{
                        property: 'Archived',
                        operator: '=',
                        value: false
                    }];
                }
                record.getCollection( 'Children').load( collectionConfig );
            };
        });
    },

    _createNodes: function(data) {
        //These need to be sorted into a hierarchy based on what we have. We are going to add 'other' nodes later
        var nodes = [];
        //Push them into an array we can reconfigure
        _.each(data, function(record) {
            var localNode = (gApp.getContext().getProjectRef() === record.get('Project')._ref);
            nodes.push({'Name': record.get('FormattedID'), 'record': record, 'local': localNode});
        });
        return nodes;
    },

    _findNode: function(nodes, record) {
        var returnNode = null;
            _.each(nodes, function(node) {
                if ((node.record && node.record.data._ref) === record._ref){
                     returnNode = node;
                }
            });
        return returnNode;

    },
    _findParentType: function(record) {
        //The only source of truth for the hierachy of types is the typeStore using 'Ordinal'
        var ord = null;
        for ( var i = 0;  i < gApp._typeStore.totalCount; i++ )
        {
            if (record.data._type === gApp._typeStore.data.items[i].get('TypePath').toLowerCase()) {
                ord = gApp._typeStore.data.items[i].get('Ordinal');
                break;
            }
        }
        ord += 1;   //We want the next one up, if beyond the list, set type to root
        //If we fail this, then this code is wrong!
        if ( i >= gApp._typeStore.totalCount) {
            return null;
        }
        var typeRecord =  _.find(  gApp._typeStore.data.items, function(type) { return type.get('Ordinal') === ord;});
        return (typeRecord && typeRecord.get('TypePath').toLowerCase());
    },
    _findNodeById: function(nodes, id) {
        return _.find(nodes, function(node) {
            return node.record.data._ref === id;
        });
    },
    _findParentNode: function(nodes, child){
        if (child.record.data._ref === 'root') return null;
        var parent = child.record.data.Parent;
        var pParent = null;
        if (parent ){
            //Check if parent already in the node list. If so, make this one a child of that one
            //Will return a parent, or null if not found
            pParent = gApp._findNode(nodes, parent);
        }
        else {
            //Here, there is no parent set, so attach to the 'null' parent.
            var pt = gApp._findParentType(child.record);
            //If we are at the top, we will allow d3 to make a root node by returning null
            //If we have a parent type, we will try to return the null parent for this type.
            if (pt) {
                var parentName = '/' + pt + '/null';
                pParent = gApp._findNodeById(nodes, parentName);
            }
        }
        //If the record is a type at the top level, then we must return something to indicate 'root'
        return pParent?pParent: gApp._findNodeById(nodes, 'root');
    },
        //Routines to manipulate the types

    _getSelectedOrdinal: function() {
        return gApp.down('#piType').lastSelection[0].get('Ordinal')
    },

     _getTypeList: function(highestOrdinal) {
        var piModels = [];
        _.each(gApp._typeStore.data.items, function(type) {
            //Only push types below that selected
            if (type.data.Ordinal <= (highestOrdinal ? highestOrdinal: 0) )
                piModels.push({ 'type': type.data.TypePath.toLowerCase(), 'Name': type.data.Name});
        });
        return piModels;
    },

    _highestOrdinal: function() {
        return _.max(gApp._typeStore.data.items, function(type) { return type.get('Ordinal'); }).get('Ordinal');
    },
    _getModelFromOrd: function(number){
        var model = null;
        _.each(gApp._typeStore.data.items, function(type) { if (number == type.get('Ordinal')) { model = type; } });
        return model && model.get('TypePath');
    },

    _createTree: function (nodes) {
        //Try to use d3.stratify to create nodet
        var nodetree = d3.stratify()
                    .id( function(d) {
                        var retval = (d.record && d.record.data._ref) || null; //No record is an error in the code, try to barf somewhere if that is the case
                        return retval;
                    })
                    .parentId( function(d) {
                        var pParent = gApp._findParentNode(nodes, d);
                        return (pParent && pParent.record && pParent.record.data._ref); })
                    (nodes);
        return nodetree;
    },

    redrawTree: function() {
        if (gApp._nodeTree) {
            d3.select("g").remove();
            gApp._nodeTree = null;
        }
        gApp._enterMainApp();
    },

    launch: function() {

        this.on('redrawTree', this.redrawTree);
    },

    initComponent: function() {
        this.callParent(arguments);
        this.addEvents('redrawTree');
    },

    _initialiseD3: function() {
        d3.selection.prototype.addPredecessors = function  (nodes) {
            return this.each(function(node, index, array) {
                var record = node.data.record;
                if (record.data.ObjectID && record.get('Predecessors').Count) {    //Only real ones have this
                    record.getCollection('Predecessors').load().then({
                        success: function(preds) {
                            _.each(preds, function(pred){
                                var pn = _.find(nodes.nodes, function(d) {
                                    return d.data.record && (d.data.record.data._ref === pred.get('_ref'));
                                });
                                pn.append("path")
                                    .attr("class", "predecessor--link")
                                    .attr("d", function(d) {
                                        return "M" + d.y + "," + d.x
                                            + "S" + (d.y - 100) + "," + d.x + ((d.x - node.x)/2)
                                            + " " + node.y + "," + node.x;
                                });

                            });
                        },
                        failure: function(error) {
//                            debugger;
                        }
                    });
                }
            });
        };
        d3.selection.prototype.addSuccessors = function  () {
            return this.each(function(node, index, array) {
//                debugger;
            });
        };
    }
});
}());