/*
   Copyright 2010 Micah Altman, Michael McDonald

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   This file is part of The Public Mapping Project
   http://sourceforge.net/projects/publicmapping/

   Purpose:
       This script file creates the map and controls all behaviors of the
       editing tools.
   
   Author: 
        Andrew Jennings, David Zwarg
*/

/*
 * Create an OpenLayers.Layer.WMS type layer.
 *
 * @param name The name of the layer (appears in the layer switcher).
 * @param layer The layer name (or array of names) served by the WMS server
 * @param extents The extents of the layer -- must be used for GeoWebCache.
 */

/* 
 * Get the value of the "Show Layer by:" dropdown.
 */

function getShowBy() {
    return $('#showby').val();
}

/*
 * Get the value of the "Show Boundaries:" dropdown.
 */
function getBoundLayer() {
    return $('#boundfor').val();
}

/*
 * Get the value of the "Show Districts by:" dropdown. This returns
 * an object with a 'by' and 'modified' property, since the selection
 * of this dropdown may also be 'None', 'Compactness' or 'Contiguity'
 *  but for performance and query reasons, the subject ID may not be empty.
 */
function getDistrictBy() {
    var orig = $('#districtby').val();
    var mod = new RegExp('^(.*)\.(None|Compactness|Contiguity)').test(orig);
    if (mod) {
        orig = RegExp.$1;
        mod = RegExp.$2;
    }
    return { by: orig, modified: mod }; 
}

/**
 * Get the value of the history cursor.
 */
function getPlanVersion() {
    var ver = $('#history_cursor').val();
    return ver;
}


/*
 * The URLs for updating the calculated geography and demographics.
 */
var geourl = '/districtmapping/plan/' + PLAN_ID + '/geography/';
var demourl = '/districtmapping/plan/' + PLAN_ID + '/demographics/';

/**
 * Add proper class names so css may style the PanZoom controls.
 */
function doMapStyling() {
    $('#OpenLayers\\.Control\\.PanZoomBar_3_panup').addClass('olControlPan olControlPanUpItemInactive');
    $('#OpenLayers\\.Control\\.PanZoomBar_3_panright').addClass('olControlPan olControlPanRightItemInactive');
    $('#OpenLayers\\.Control\\.PanZoomBar_3_pandown').addClass('olControlPan olControlPanDownItemInactive');    
    $('#OpenLayers\\.Control\\.PanZoomBar_3_panleft').addClass('olControlPan olControlPanLeftItemInactive');
    $('#OpenLayers\\.Control\\.PanZoomBar_3_zoomin').addClass('olControlZoom olControlZoomInInactive');   
    $('#OpenLayers\\.Control\\.PanZoomBar_3_zoomout').addClass('olControlZoom olControlZoomOutInactive'); 
    $('#OpenLayers\\.Control\\.PanZoomBar_3_OpenLayers\\.Map_5').addClass('olControlZoom olControlZoomGrabInactive'); 
    $('#OpenLayers_Control_PanZoomBar_ZoombarOpenLayers\\.Map_5').addClass('olControlZoom olControlZoomBarInactive');
}

/*
 * Resize the map. This is a fix for IE 7, which does not assign a height
 * to the map div if it is not explicitly set.
 */
function initializeResizeFix() {
    var vp = $('.olMapViewport')[0];
    if( vp.clientHeight > 0 ) {
        return;
    }

    var resizemap = function() {
        var mapElem = $('#mapandmenu')[0]
        if(!window.innerHeight) {
            mapElem.style.height = (window.document.body.clientHeight - 90) + 'px';
            vp.style.height = (window.document.body.clientHeight - 150) + 'px';
        }
    };
   
    resizemap();
    window.onresize = resizemap;
}

/* 
 * Create a div for tooltips on the map itself; this is used
 * when the info tool is activated.
 */
function createMapTipDiv() {
    var tipdiv = document.createElement('div');
    var tipelem = document.createElement('h1');
    tipelem.appendChild(document.createTextNode(BODY_MEMBER+'Name'));
    tipdiv.appendChild(tipelem);
    tipelem = document.createElement('div');
    tipelem.id = 'tipclose';
    tipelem.onclick = function(e){
        OpenLayers.Event.stop(e || event);
        tipdiv.style.display = 'none';
    };
    tipelem.appendChild(document.createTextNode('[x]'));
    tipdiv.appendChild(tipelem);
    tipelem = document.createElement('div');
    tipelem.appendChild(document.createTextNode('Demographic 1:'));
    tipdiv.appendChild(tipelem);
    tipelem = document.createElement('div');
    tipelem.appendChild(document.createTextNode('Demographic 2:'));
    tipdiv.appendChild(tipelem);
    tipelem = document.createElement('div');
    tipelem.appendChild(document.createTextNode('Demographic 3:'));
    tipdiv.appendChild(tipelem);
    tipdiv.style.zIndex = 100000;
    tipdiv.style.position = 'absolute';
    tipdiv.style.opacity = '0.8';
    tipdiv.className = 'tooltip';

    return tipdiv;
}

function createDistrictTipDiv() {
    var tipdiv = document.createElement('div');
    var tipelem = document.createElement('h1');
    tipelem.appendChild(document.createTextNode(BODY_MEMBER+'Name'));
    tipdiv.appendChild(tipelem);
    tipelem = document.createElement('div');
    tipelem.id = 'tipclose';
    tipelem.onclick = function(e){
        OpenLayers.Event.stop(e || event);
        tipdiv.style.display = 'none';
    };
    tipelem.appendChild(document.createTextNode('[x]'));
    tipdiv.appendChild(tipelem);

    tipdiv.style.zIndex = 100000;
    tipdiv.style.position = 'absolute';
    tipdiv.style.opacity = '0.8';
    tipdiv.style.width = '85px';
    tipdiv.className = 'tooltip districtidtip';

    return tipdiv;
}


/**
 * Initialize the map from WMS GetCapabilities.
 */
function init() {
    // if the draw tab is disabled, don't init any map jazz.
    if ($('#tab_draw').hasClass('ui-state-disabled')){
        return;
    }

    // default map_server is on same host unless otherwise specified 
    if (MAP_SERVER=="") {
	MAP_SERVER=window.location.host
    }

    // set the version cursor
    $('#history_cursor').val(PLAN_VERSION);

    // set the max extent to be the boundaries of the world in
    // spherical mercator to avoid all geowebcache offset issues
    var max = 20037508.342789244;
    var srs = "EPSG:3785";
    var extent = new OpenLayers.Bounds(-max, -max, max, max);

    // ensure the page is fully loaded before the map is initialized
    $(document).ready(function() {
        mapinit( srs, extent );
    });
}

/*
 * Initialize the map with extents and SRS pulled from WMS.
 */
function mapinit(srs,maxExtent) {
    var defaultThematicOpacity = 0.8;
    var thematicLayers = [];

    var createLayer = function( name, layer, srs, extents, transparent, visibility, isThematicLayer ) {
        var newLayer = new OpenLayers.Layer.WMS( name,
            window.location.protocol + '//' + MAP_SERVER + '/geoserver/gwc/service/wms',
            {
                srs: srs,
                layers: layer,
                tiles: 'true',
                tilesOrigin: extents.left + ',' + extents.bottom,
                format: 'image/png',
                transparent: true
            },
            {
                visibility: visibility,
                isBaseLayer: false,
                displayOutsideMaxExtent: true,
                opacity: isThematicLayer ? defaultThematicOpacity : 1.0
            }
        );
        if (isThematicLayer) {
            thematicLayers.push(newLayer);
        }
        return newLayer;
    };

    // Set the visible thematic layer. This is a replacement for
    // directly setting the base layer, which can no longer be done
    // since a base map is now being used.
    var setThematicLayer = function (layer) {
        $(thematicLayers).each(function(i, thematicLayer) {
            if (thematicLayer.visibility) {
                thematicLayer.setVisibility(false);
            }
        });
        if (!layer.visibility) {
            layer.setVisibility(true);
        }
    };

    // The assignment mode -- the map is initially in navigation mode,
    // so the assignment mode is null.
    var assignMode = null;

    // This projection is web mercator
    var projection = new OpenLayers.Projection(srs);

    // Explicitly create the navigation control, since
    // we'll want to deactivate it in the future.
    var navigate = new OpenLayers.Control.Navigation({
        autoActivate: true,
        handleRightClicks: true
    });

    // Create a slippy map.
    olmap = new OpenLayers.Map('map', {
        maxExtent: maxExtent,
        projection: projection,
        units: 'm',
        panMethod: null,
        controls: [
            navigate,
            new OpenLayers.Control.PanZoomBar(),
            new OpenLayers.Control.KeyboardDefaults()
        ]
    });

    // These layers are dependent on the layers available in geowebcache
    var layers = [];

    

    // Calculate the minimum zoom level based on the extent of the study area
    var studyWidthMeters = STUDY_EXTENT[2] - STUDY_EXTENT[0];
    var mapWidthPixels = $('div.olMapViewport').width();
    var metersPerPixel = studyWidthMeters / mapWidthPixels;
    var maxMetersPerPixel = 156543.033928; // at zoom 0 (20037508.342789244 * 2 / 256)

    // maxmpp / 2^zoom = mpp
    // zoom = log(maxmpp/mpp)/log(2)
    var level = Math.log(maxMetersPerPixel / metersPerPixel) / Math.LN2;
    
    var minZoomLevel = Math.floor(level) - 1;
    var maxZoomLevel = 17; // This level is far enough zoomed to view blocks in any state
    var numZoomLevels = maxZoomLevel - minZoomLevel + 1;

    // Set the base layers
    var getLayer = function(provider, mapType) {
        var options = {};
        var types = {};

        switch (provider) {
            case 'bing':
                options = {
                    minZoomLevel: minZoomLevel,
                    maxZoomLevel: maxZoomLevel,
                    projection: projection,
                    sphericalMercator: true,
                    maxExtent: maxExtent    
                };

                types = {
                    aerial: VEMapStyle.Aerial,
                    hybrid: VEMapStyle.Hybrid,
                    road: VEMapStyle.Road 
                };
    
                options.type = types[mapType];
                if (options.type) {
                    return new OpenLayers.Layer.VirtualEarth(layerName, options);
                }

            case 'google':
                options = {
                    numZoomLevels: numZoomLevels,
                    minZoomLevel: minZoomLevel,
                    projection: projection,
                    sphericalMercator: true,
                    maxExtent: maxExtent
                };
                
                types = {
                    aerial: G_SATELLITE_MAP,
                    hybrid: G_HYBRID_MAP, 
                    road: G_NORMAL_MAP
                };
    
                options.type = types[mapType];
                if (options.type) {
                    return new OpenLayers.Layer.Google(layerName, options);
                }

            case 'osm':
                options = {
                    numZoomLevels: numZoomLevels,
                    minZoomLevel: minZoomLevel,
                    projection: projection
                };

                // Only road type is supported. OSM does not have aerial or hybrid views.
                if (mapType === 'road') {
                    return new OpenLayers.Layer.OSM(layerName, null, options);
                }

            default:
                return null;
        }
    };

    // Map type -> label. Also used for determining if there are multiple of the same type.
    var mapTypes = {
        aerial: { label: 'Satellite' },
        hybrid: { label: 'Hybrid' },
        road: { label: 'Road' }
    };

    // Construct each layer, and assign a label.
    $(BASE_MAPS.split(',')).each(function(i, layerName) {
        var hyphenIndex = layerName.indexOf('-');
        if (hyphenIndex <= 0) {
            return null;
        }
        var provider = (layerName.substring(0, hyphenIndex)).toLowerCase();
        var mapType = (layerName.substring(hyphenIndex + 1)).toLowerCase();
        var layer = getLayer(provider, mapType);
        if (layer) {
            var existing = mapTypes[mapType];
            if (existing.layer) {
                existing.layer.name = mapTypes[mapType].label + " (" + existing.provider + ")";
                layer.name = mapTypes[mapType].label + " (" + provider + ")";
            } else {
                layer.name = mapTypes[mapType].label;
                mapTypes[mapType].layer = layer;
                mapTypes[mapType].provider = provider;
            }
            layers.push(layer);
        }
    });

    // If no base maps are configured, add one that's not visible, simply to utilize
    // the resolution information. No tiles will ever be requested
    if (layers.length === 0) {
        var layer = getLayer('osm', 'road');
        layer.setVisibility(false);
        layers.push(layer);
    }
    
    // Set up the opacity slider and connect change events to control the base and thematic layer opacities
    $('#opacity_slider').slider({
        value: 100 - defaultThematicOpacity * 100,
        slide: function(event, ui) {
            var isThematic = $('#thematic_radio').attr('checked');
            $(olmap.layers).each(function(i, layer) {
                if ((isThematic && !layer.isBaseLayer) || (!isThematic && layer.isBaseLayer)) {
                    layer.setOpacity(1 - ui.value / 100);
                }
            });
        }
    });

    // Add a row for each base map to the Basemap Settings container for switching
    $(layers).each(function(i, layer) {
        var container = $('#map_type_content_container');
        var button = $('<button class="map_type_button">' + layer.name + '</button>');
            
        // split is in case the provider is in parens due to there being multiple
        var mapType = layer.name.split(' ')[0];
        var toggle = $('#map_type_toggle');

        // Default to the first map type
        if (i === 0) {
            toggle.button('option', 'label', mapType)
        }

        // Set the base layer, and change label when the option is selected
        button.click(function() {
            $('#base_map_type').html(mapType);
            toggle.button('option', 'label', mapType)
            olmap.setBaseLayer(layer);
            toggle.click();
        });
           
        container.append(button);
    });

    // Set the default map type label
    $('#base_map_type').html(layers[0].name);


    // Function for monitoring when map layer radio changes, and updating the slider accordingly
    var getMapLayerRadioChangeFn = function(isThematic){
        return function() {        
            var found = null;
            for (var i = 0; i < olmap.layers.length; i++) {
                var layer = olmap.layers[i];
                if ((isThematic && !layer.isBaseLayer) || (!isThematic && layer.isBaseLayer)) {
                    found = layer;
                    break;
                }
            }
            if (!found) { return; }
            if (found.opacity === null) {
                found.opacity = 1; // OpenLayers doesn't set opacity on load when it's 100%
            }
            $('#opacity_slider').slider('value', found.opacity * 100);
        };
    };
    $('#thematic_radio').click(getMapLayerRadioChangeFn(true));
    $('#basemap_radio').click(getMapLayerRadioChangeFn(false));

    // Hide the map type selection if there are 1 or fewer types
    if (layers.length <= 1) {
        var mapTypeRight = $('#map_type_toggle').css('right');
        $('#map_type_settings').hide();

        // Shift the map settings to fill the void where the map type button was.
        $('#settings_toggle').css('right', mapTypeRight);
        $('#map_settings_content').css('right', mapTypeRight);
    }

    // Construct map layers, ensuring boundary layers are at the end of the list for proper overlaying
    for (i in MAP_LAYERS) {
        var layerName = MAP_LAYERS[i];
        if (layerName.indexOf('boundaries') == -1) {
            layers.unshift(createLayer( layerName, layerName, srs, maxExtent, false, true, true ));
        } else {
            layers.push(createLayer( layerName, layerName, srs, maxExtent, true, false, false ));
        }
    }

    // The strategy for loading the districts. This is effectively
    // a manual refresh, with no automatic reloading of district
    // boundaries except when explicitly loaded.
    var districtStrategy = new OpenLayers.Strategy.BBOX({ratio:2});

    // The style for the districts. This serves as the base
    // style for all rules that apply to the districtLayer
    var districtStyle = {
        fill: true,
        fillOpacity: 0.01,    // need some opacity for picking districts
        fillColor: '#ee9900', // with ID tool -- fillColor needed, too
        strokeColor: '#ee9900',
        strokeOpacity: 1,
        strokeWidth: 2,
        label: '${name}',
        fontColor: '#663300',
        fontSize: '10pt',
        fontFamily: 'Arial,Helvetica,sans-serif',
        fontWeight: '800',
        labelAlign: 'cm'
    };

    /**
     * Get information about the snap layer that should be used, according
     * to the current zoom level.
     */
    var getSnapLayer = function() {
        var zoom = 0;
        if (typeof(olmap) != 'undefined') {
            zoom = olmap.zoom;
        }
        var min_layer = { min_zoom: -1 };

        $('#boundfor option').removeAttr('disabled');

        for (var i in SNAP_LAYERS) {
            var snap_layer = SNAP_LAYERS[i];
            var my_min = snap_layer.min_zoom;
            if (zoom >= my_min && my_min > min_layer.min_zoom) {
                min_layer = snap_layer;
            }
            if (my_min >= zoom) {  
                $('#boundfor option[value*=' + snap_layer.level + ']').attr('disabled', true);  
            }
        }
        
        // Disable the boundary layers for all layers with geounits nested in this one
        $('#boundfor option[value*=' + min_layer.level + ']').attr('disabled', true);   
        if ($('#boundfor option:selected').attr('disabled')) {  
            $('#boundfor option').first().attr('selected', 'selected')  
            .siblings().each( function() { $(this).removeAttr('selected') ; });     
            $('#boundfor').change();    
        }

        return { layer: min_layer.layer, level:min_layer.level, display:min_layer.name, geolevel: min_layer.geolevel };
    }

    /**
     * Get the OpenLayers filters that describe the version and subject
     * criteria for the district layer. Geometry is optional, and when
     * passed in adds an additional intersection filter on the geometry.
     */
    var getVersionAndSubjectFilters = function(extent, geometry) {
        var dby = getDistrictBy();
        var ver = getPlanVersion();
        var lyr = getSnapLayer();
        var filters = [
            new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.EQUAL_TO,
                property: 'version',
                value: ver
            }),
            new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.EQUAL_TO,
                property: 'subject',
                value: dby.by
            }),
            new OpenLayers.Filter.Spatial({
                type: OpenLayers.Filter.Spatial.BBOX,
                value: extent
            }),
            new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.EQUAL_TO,
                property: 'level',
                value: lyr.geolevel
            })
        ];
        if (geometry) {
            filters.push(new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.EQUAL_TO,
                property: 'geom',
                value: geometry
            }));
        }
        return new OpenLayers.Filter.Logical({
            type: OpenLayers.Filter.Logical.AND,
            filters: filters
        });
    };

    
    // A vector layer that holds all the districts in
    // the current plan.
    var districtLayer = new OpenLayers.Layer.Vector(
        'Current Plan',
        {
            strategies: [
                districtStrategy
            ],
            protocol: new OpenLayers.Protocol.HTTP({
                url: '/districtmapping/plan/' + PLAN_ID + '/district/versioned/',
                format: new OpenLayers.Format.GeoJSON()
            }),
            styleMap: new OpenLayers.StyleMap(new OpenLayers.Style(districtStyle)),
            projection: projection,
            filter: getVersionAndSubjectFilters(maxExtent)
        }
    );

    // Create a vector layer to hold the current selection
    // of features that are to be manipulated/added to a district.
    var selection = new OpenLayers.Layer.Vector('Selection',{
        styleMap: new OpenLayers.StyleMap({
            "default": new OpenLayers.Style(
                OpenLayers.Util.applyDefaults(
                    { 
                        fill: true, 
                        fillOpacity: 0.0,
                        strokeColor: '#ffff00', 
                        strokeWidth: 3 
                    }, 
                    OpenLayers.Feature.Vector.style["default"]
                )
            ),
            "select":  new OpenLayers.Style(
                OpenLayers.Util.applyDefaults(
                    { 
                        fill: true, 
                        fillColor: '#ee9900',
                        strokeColor: '#ee9900'
                    }, 
                    OpenLayers.Feature.Vector.style["select"]
                )
            ),
            "error": new OpenLayers.Style(
                OpenLayers.Util.applyDefaults(
                    {
                        fill: false,
                        strokeColor: '#ee0000'
                    },
                    OpenLayers.Feature.Vector.style["select"]
                )
            )
        })
    });

    // Add these layers to the map
    layers.push(districtLayer);
    layers.push(selection);
    olmap.addLayers(layers);

    // If a base map is intentionally not configured, make it invisible, and remove settings tool
    if (!BASE_MAPS) {
        olmap.baseLayer.setVisibility(false);
        $('#map_settings').hide();
    }

    // Create a protocol that is used by all editing controls
    // that selects geography at the specified snap layer.
    var getProtocol = new OpenLayers.Protocol.HTTP({
        url: '/districtmapping/plan/' + PLAN_ID + '/unlockedgeometries/',
        readWithPOST: true,
        format: new OpenLayers.Format.GeoJSON()
    });

    var idProtocol = new OpenLayers.Protocol.WFS({
        url: window.location.protocol + '//' + MAP_SERVER + '/geoserver/wfs',
        featureType: 'identify_geounit',
        featureNS: NS_HREF,
        featurePrefix: NAMESPACE,
        srsName: srs,
        geometryName: 'geom'
    });

    // Create a simple point and click control for selecting
    // geounits one at a time.
    var getControl = new OpenLayers.Control.GetFeature({
        autoActivate: false,
        protocol: getProtocol,
        multipleKey: 'shiftKey',
        toggleKey: 'ctrlKey',
        filterType: OpenLayers.Filter.Spatial.INTERSECTS
    });

    // Create a rectangular drag control for selecting
    // geounits that intersect a box.
    var boxControl = new OpenLayers.Control.GetFeature({
        autoActivate: false,
        protocol: getProtocol,
        click: false,
        box: true,
        multipleKey: 'shiftKey',
        toggleKey: 'ctrlKey',
        filterType: OpenLayers.Filter.Spatial.INTERSECTS
    });

    // Add header for CSRF validation. This is needed, because setting
    // the headers parameter does not work when performing POSTs (it's hardcoded).
    var extendReadForCSRF = function(protocol) {
        OpenLayers.Util.extend(protocol, {
            read: function(options) {
                OpenLayers.Protocol.prototype.read.apply(this, arguments);
                options = OpenLayers.Util.applyDefaults(options, this.options);
                options.params = OpenLayers.Util.applyDefaults(options.params, this.options.params);
                if(options.filter) {
                    options.params = this.filterToParams(options.filter, options.params);
                }
                var resp = new OpenLayers.Protocol.Response({requestType: "read"});
                resp.priv = OpenLayers.Request.POST({
                    url: options.url,
                    callback: this.createCallback(this.handleRead, resp, options),
                    data: OpenLayers.Util.getParameterString(options.params),
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });
                return resp;
            }
        });
    };

    // Extend the request function on the GetFeature control to allow for
    // dynamic filtering and setting a header needed for CSRF validation
    var filterExtension = {
        request: function (bounds, options) {
            // Allow for dynamic filtering, and extend for CSRF validation headers
            var filter = getVersionAndSubjectFilters(maxExtent, bounds.toGeometry().toString());
            extendReadForCSRF(this.protocol);

            // The rest of this function is exactly the same as the original
            options = options || {};
            OpenLayers.Element.addClass(this.map.viewPortDiv, "olCursorWait");
            
            this.protocol.read({
                filter: filter,
                callback: function(result) {
                    if(result.success()) {
                        if(result.features.length) {
                            if(options.single == true) {
                                this.selectBestFeature(result.features, bounds.getCenterLonLat(), options);
                            } else {
                                this.select(result.features);
                            }
                        } else if(options.hover) {
                            this.hoverSelect();
                        } else {
                            this.events.triggerEvent("clickout");
                            if(this.clickout) {
                                this.unselectAll();
                            }
                        }
                    }
                    OpenLayers.Element.removeClass(this.map.viewPortDiv, "olCursorWait");
                },
                scope: this                        
            });
        }
    };

    // Apply the filter extension to both the get and box controls
    OpenLayers.Util.extend(getControl, filterExtension);
    OpenLayers.Util.extend(boxControl, filterExtension);

    // Reload the information tabs and reload the filters
    var updateInfoDisplay = function() {
        $('.geography').load(
            geourl, 
            {  
                demo: getDistrictBy().by,
                version: getPlanVersion()
            }, 
            function(rsp, status, xhr) {
                if (xhr.status > 400) {
                    window.location.href = '/';
                }
                else {
                    loadTooltips();
                    sortByVisibility(true);
                }
            }
        );

        $('.demographics').load(
            demourl, 
            {
                version: getPlanVersion()
            }, 
            function(rsp, status, xhr) {
                if (xhr.status > 400) {
                    window.location.href = '/';
                }
                else {
                    loadTooltips();
                    sortByVisibility(true);
                }
            }
        );            

        districtLayer.filter = getVersionAndSubjectFilters(olmap.getExtent());
        districtLayer.strategies[0].update({force:true});
    };

    // An assignment function that adds geounits to a district
    var assignOnSelect = function(feature) {
        if (selection.features.length == 0) {
            $('#assign_district').val('-1');
            return;
        }

        var district_id = feature.data.district_id;
        var geolevel_id = selection.features[0].attributes.geolevel_id;
        var geounit_ids = [];
        for (var i = 0; i < selection.features.length; i++) {
            geounit_ids.push( selection.features[i].attributes.id );
        }
        geounit_ids = geounit_ids.join('|');
        OpenLayers.Element.addClass(olmap.viewPortDiv,'olCursorWait');
        $('#working').dialog('open');
        $.ajax({
            type: 'POST',
            url: '/districtmapping/plan/' + PLAN_ID + '/district/' + district_id + '/add/',
            data: {
                geolevel: geolevel_id,
                geounits: geounit_ids,
                version: getPlanVersion()
            },
            success: function(data, textStatus, xhr) {
                var mode = data.success ? 'select' : 'error';
                if (data.success) {
                    // if no districts were updated, display a warning
                    if (!data.updated) {
                        OpenLayers.Element.removeClass(olmap.viewPortDiv, 'olCursorWait');
                        $('#working').dialog('close');
                        $('<div id="errorDiv">No districts were updated.</div>').dialog({
                            modal: true,
                            autoOpen: true,
                            title: 'Error',
                            buttons: { 
                                'OK': function() {
                                    $('#errorDiv').remove();
                                }
                            }
                        });
                        updateInfoDisplay();
                    } else {                    
                        // update the max version of this plan
                        PLAN_VERSION = data.version;
                        PLAN_HISTORY[PLAN_VERSION] = true;

                        // set the version cursor
                        $('#history_cursor').val(data.version);

                        // update the UI buttons to show that you can
                        // perform an undo now, but not a redo
                        $('#history_redo').addClass('disabled');
                        $('#history_undo').removeClass('disabled');

                        updateInfoDisplay();

                        $('#saveplaninfo').trigger('planSaved', [ data.edited ]);
                    }
                }
                else {
                    if ('redirect' in data) {
                        window.location.href = data.redirect;
                        return;
                    }
                    OpenLayers.Element.removeClass(olmap.viewPortDiv, 'olCursorWait');
                    $('#working').dialog('close');
                }

                for (var i = 0; i < selection.features.length; i++) {
                    selection.drawFeature(selection.features[i], mode);
                }

                if (assignMode == null) {
                    $('#assign_district').val('-1');
                }
                else if (assignMode == 'dragdrop') {
                    $('#assign_district').val('-1');
                    dragdropControl.deactivate();
                    dragdropControl.resumeTool.activate();
                }
            },
            error: function(xhr, textStatus, error) {
                window.status = 'failed to select';
            }
        });
    };

    // When the selection is changed, perform the addition or subtraction
    // to the current geounit selection. Also, if the assignment mode is
    // either 'anchor' or 'dragdrop', do some more processing.
    var unitsSelected = function(features, subtract) {
        if (subtract) {
            var removeme = [];
            for (var i = 0; i < selection.features.length; i++) {
                for (var j = 0; j < features.length; j++) {
                    if (selection.features[i].data.id == features[j].data.id) {
                        removeme.push(selection.features[i]);
                    }
                }
            }
            selection.removeFeatures(removeme);
        }
        else {
	    // Check to make sure we haven't exceeded the FEATURE_LIMIT in this selection or total selection
            if (features.length > FEATURE_LIMIT) {
                $('<div id="toomanyfeaturesdialog">You cannot select that many features at once.\n\nConsider drawing a smaller area with the selection tool.</div>').dialog({
                    modal: true,
                    autoOpen: true,
                    title: 'Sorry',
                    buttons: { 
                        'OK': function() {
                        $('#toomanyfeaturesdialog').remove();
                        }
                    }
                });
                return;
            } else if (features.length + selection.features.length > FEATURE_LIMIT) {
                $('<div id="toomanyfeaturesdialog">You cannot select any more features.\n\nConsider assigning your current selection to a district first.</div>').dialog({
                    modal: true,
                    autoOpen: true,
                    title: 'Sorry',
                    buttons: { 
                        'OK': function() {
                        $('#toomanyfeaturesdialog').remove();
                        }
                    }
                });
                return;
            }

            var addme = [];
            for (var i = 0; i < features.length; i++) {
                var match = false;
                for (var j = 0; j < selection.features.length && !match; j++) {
                    if (features[i].data.id == selection.features[j].data.id) {
                        match = true;
                    }
                }
                if (!match) {
		    addme.push(features[i]);
                }
            }
            selection.addFeatures(addme);

            // this is necessary because a feature may be selected more
            // than once, and the js feature object is different, but the
            // actual feature itself is the same geometry and attributes.
            for (var i = 0; i < addme.length; i++) {
                selection.features[addme[i].fid || addme[i].id] = addme[i];
            }
        }

        if (assignMode == null) {
            return;
        }
        else if (assignMode == 'anchor') {
            var d_id = $('#assign_district').val();
            if (parseInt(d_id,10) > 0) {
                var feature = { data:{ district_id: d_id } };
                assignOnSelect(feature);
            }
        }
        else if (assignMode == 'dragdrop') {
            var active = olmap.getControlsBy('active',true);
            var currentTool = null;
            for (var i = 0; i < active.length && currentTool == null; i++) {
                if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                    currentTool = active[i];
                }
            }
            currentTool.deactivate();

            dragdropControl.resumeTool = currentTool;
            dragdropControl.activate();
        }
    };

    // Create a polygon select control for free-form selections.
    var polyControl = new OpenLayers.Control.DrawFeature( 
        selection,
        OpenLayers.Handler.Polygon,
        {
            handlerOptions: {
                freehand: true,
                freehandToggle: null
            },
            featureAdded: function(feature){
                // WARNING: not a part of the API!
                var append = this.handler.evt.shiftKey;
                var subtract = this.handler.evt.ctrlKey && (assignMode == null);
                var newOpts = getControl.protocol.options;
                newOpts.featureType = getSnapLayer().layer;
                getControl.protocol = new OpenLayers.Protocol.HTTP( newOpts );
                extendReadForCSRF(getControl.protocol);
                
                getControl.protocol.read({
                    filter: getVersionAndSubjectFilters(maxExtent, feature.geometry),
                    callback: function(rsp){
                        // first, remove the lasso feature
                        var lasso = selection.features[selection.features.length - 1];
                        selection.removeFeatures([lasso]);

                        if (!(append || subtract)){
                            // if this is a new lasso, remove all the 
                            // old selected features
                            selection.removeFeatures(selection.features);
                        }

                        unitsSelected( rsp.features, subtract );
                    }
                });
            }
        }
    );

    // set this timeout function, since jquery is apparently not ready
    // to select the elements based on this class during regular init.
    // also, the reference to the polyControl is used in this init method
    setTimeout(function(){
        var jtmp = $('.olHandlerBoxSelectFeature');

        var polySelectStyle = {
            pointRadius: 0,
            strokeWidth: parseInt(jtmp.css('borderTopWidth').slice(0,1),10),
            strokeColor: jtmp.css('borderTopColor'),
            strokeOpacity: parseFloat(jtmp.css('opacity')),
            fillColor: jtmp.css('background-color'),
            fillOpacity: parseFloat(jtmp.css('opacity'))
        };

        polyControl.handler.style = polySelectStyle;
    }, 100);

    // Create a tooltip inside of the map div
    var tipdiv = createMapTipDiv();
    olmap.div.insertBefore(tipdiv,olmap.div.firstChild);

    // Create a control that shows the details of the district
    // underneath the cursor.
    var idControl = new IdGeounit({
        autoActivate: false,
        protocol: idProtocol
    });

    var districtIdDiv = createDistrictTipDiv();
    olmap.div.insertBefore(districtIdDiv,olmap.div.firstChild);
    var districtIdControl = new OpenLayers.Control.SelectFeature(
        districtLayer,
        {
            hover: false,
            onSelect: (function(){
                var showTip = function(tipFeature, pixel) {
                    $(districtIdDiv.firstChild).text(tipFeature.attributes.name);

                    var leftOffset = $(districtIdDiv).width() + 15;
                    var topOffset = $(districtIdDiv).height() + 15;
                    if (pixel.x < leftOffset) { 
                        pixel.x = leftOffset;
                    }
                    else if (pixel.x > olmap.div.clientWidth - leftOffset) {
                        pixel.x = olmap.div.clientWidth - leftOffset;
                    }
                    if (pixel.y < topOffset) {
                        pixel.y = topOffset;
                    }
                    else if (pixel.y > (olmap.div.clientHeight-29) - topOffset) {
                        pixel.y = (olmap.div.clientHeight-29) - topOffset;
                    }
                    $(districtIdDiv).css('top',pixel.y - topOffset);
                    $(districtIdDiv).css('left',pixel.x - leftOffset);
                    districtIdDiv.style.display = 'block';

                    // hide the other tip
                    tipdiv.style.display = 'none';
                };
                return function(feature, event){
                    window.status = feature.attributes.name;
                    var pixel = this.handlers.feature.evt.xy;
                    showTip(feature, pixel);
                };
            })(),
            onUnselect: function(feature) {
                districtIdDiv.style.display = 'none';
            }
        }
    );
    districtIdControl.events.register('deactivate', districtIdControl, function() {
        districtIdDiv.style.display = 'none';
    });

    // Create a tool that toggles whether a district is locked when clicked on.
    var lockDistrictControl = new OpenLayers.Control.SelectFeature(
        districtLayer,
        {
            onSelect: function(feature) {
                $.ajax({
                    type: 'POST',
                    url: '/districtmapping/plan/' + PLAN_ID + '/district/' + feature.attributes.district_id + '/lock/',
                    data: {
                        lock: !feature.attributes.is_locked,
                        version: getPlanVersion()
                    },
                    success: function(data, textStatus, xhr) {
                        selection.removeFeatures(selection.features);
                        districtLayer.strategies[0].update({force:true});
                    }
                });
            }
        }
    );

    // Get the feature at the point in the layer.
    var featureAtPoint = function(pt, lyr) {
        for (var i = 0; i < lyr.features.length; i++) {
            if (lyr.features[i].geometry != null &&
                pt.intersects(lyr.features[i].geometry)) {
                return lyr.features[i];
            }
        }

        return null;
    };

    // Test if the provided point lays within the features in the provided
    // layer.
    var pointInFeatures = function(pt, lyr) {
        return featureAtPoint(pt, lyr) != null;
    };

    // Create a control that shows where a drag selection is
    // traveling.
    var dragdropControl = new OpenLayers.Control.DragFeature(
        selection,
        {
            documentDrag: true,
            onStart: function(feature, pixel) {
                var ll = olmap.getLonLatFromPixel(pixel);
                dragdropControl.lastPt = new OpenLayers.Geometry.Point(ll.lon, ll.lat);
            },
            onDrag: function(feature, pixel) {
                var ll = olmap.getLonLatFromPixel(pixel);
                var pt = new OpenLayers.Geometry.Point(ll.lon, ll.lat);
                var dist = featureAtPoint(pt, districtLayer);
                if (dist == null) {
                    dist = { data: { district_id: 1 } };
                }
                $('#assign_district').val(dist.data.district_id);
                for (var i = 0; i < selection.features.length; i++) {
                    if (selection.features[i].fid != feature.fid) {
                        selection.features[i].geometry.move(
                            pt.x - dragdropControl.lastPt.x,
                            pt.y - dragdropControl.lastPt.y
                        );
                        selection.drawFeature(selection.features[i]);
                    }
                }
                dragdropControl.lastPt = pt;
            },
            onComplete: function(feature, pixel) {
                var ll = olmap.getLonLatFromPixel(pixel);
                var pt = new OpenLayers.Geometry.Point(ll.lon, ll.lat);
                
                if (pointInFeatures(pt, districtLayer)) {
                    var dfeat = { data:{ district_id: $('#assign_district').val() } };
                    assignOnSelect(dfeat);
                }
                else {
                    selection.removeFeatures(selection.features);

                    $('#assign_district').val('-1');               
                    dragdropControl.deactivate();
                    dragdropControl.resumeTool.activate();
                }
            }
        }
    );

    // A callback to create a popup window on the map after a peice
    // of geography is selected.
    var idFeature = function(e) {
        var snapto = getSnapLayer().layer;

        // get the range of geolevels
        var maxGeolevel = 0, minGeolevel = 9999;
        for (var i = 0; i < SNAP_LAYERS.length; i++) {
            if (snapto == 'simple_' + SNAP_LAYERS[i].level) {
                minGeolevel = SNAP_LAYERS[i].geolevel;
            }
            maxGeolevel = Math.max(maxGeolevel, SNAP_LAYERS[i].geolevel);
        }
        // get the breadcrumbs to this geounit, starting at the
        // largest area (lowest geolevel) first, down to the
        // most specific geolevel
        var crumbs = {};
        var ctics = [];
        var tipFeature = e.features[0];
        for (var glvl = maxGeolevel; glvl >= minGeolevel; glvl--) {
            for (var feat = 0; feat < e.features.length; feat++) {
                if (e.features[feat].data.geolevel_id == glvl) {
                    crumbs[e.features[feat].data.id] = e.features[feat].data.name;
                }
                if (e.features[feat].data.geolevel_id == minGeolevel) {
                    tipFeature = e.features[feat];
                    for (var demo = 0; demo < DEMOGRAPHICS.length; demo++) {
                        if (e.features[feat].data.subject_id == DEMOGRAPHICS[demo].id) {
                            var text = DEMOGRAPHICS[demo].text;
                            text = text.startsWith('% ') ? text.substr(2) : text;
                            ctics.push({ lbl: text, val:parseFloat(e.features[feat].data.number) });
                        }
                    }
                }
            }
        }

        // sort the characteristics alphabetically by label
        ctics = $(ctics).sort(function(a, b) { return a.lbl > b.lbl; });

        // truncate the breadcrumbs into a single string
        var place = [];
        for (var key in crumbs) {
            place.push(crumbs[key]);
        }
        place = place.join(' / ');

        var centroid = tipFeature.geometry.getCentroid();
        var lonlat = new OpenLayers.LonLat( centroid.x, centroid.y );
        var pixel = olmap.getPixelFromLonLat(lonlat);
        tipdiv.style.display = 'block';
        tipdiv.childNodes[0].childNodes[0].nodeValue = place;
        var select = $('#districtby')[0];
        var value = parseInt(tipFeature.attributes.number, 10);

        var node = 2;
        $(ctics).each(function(i, obj) {
            try {
                $(tipdiv.childNodes[node]).html(obj.lbl + ': ' + obj.val.toLocaleString());
                node ++;
            } catch (exception) {
                // too many characteristics
            }
        });

        var halfWidth = tipdiv.clientWidth/2;
        var halfHeight = tipdiv.clientHeight/2;
        if (pixel.x < halfWidth) { 
            pixel.x = halfWidth;
        }
        else if (pixel.x > olmap.div.clientWidth - halfWidth) {
            pixel.x = olmap.div.clientWidth - halfWidth;
        }
        if (pixel.y < halfHeight) {
            pixel.y = halfHeight;
        }
        else if (pixel.y > (olmap.div.clientHeight-29) - halfHeight) {
            pixel.y = (olmap.div.clientHeight-29) - halfHeight;
        }

        tipdiv.style.left = (pixel.x - halfWidth) + 'px';
        tipdiv.style.top = (pixel.y - halfHeight) + 'px';
        if (tipdiv.pending) {
            clearTimeout(tipdiv.timeout);
            tipdiv.pending = false;
        }

        // hide the other tip
        districtIdDiv.style.display = 'none';
    };

    // A callback for feature selection in different controls.
    var featuresSelected = function(e){
        var subtract = e.object.modifiers.toggle && (assignMode == null);

        unitsSelected(e.features, subtract);
    };


    /*
    * This will return the maps's truly visible bounds; if the info
    * tabs on the right are up, that's the usual map bounds. If the 
    * info tabs are showing, it's the visible area of the map to the 
    * left of those tabs
    */
    var getVisibleBounds = function() {
        // Checking for visibility sometimes causes OpenLayers unhappiness
        try {
            if ($('.map_menu_content:visible').length > 0) {
                var offset = $('#map_menu_header').position();
                var bounds = olmap.getExtent();
                var lonLat = olmap.getLonLatFromPixel(new OpenLayers.Pixel(offset.left, offset.top));
                bounds.right = lonLat.lon;
                return bounds;
            }
        } catch (exception) {
            // that's OK - nothing we can do here
        }
        return undefined;
    }
    
    /*
    * This method is useful to determine whether an item is visible
    * to the user - pass in the bounds from getVisibleBounds if the 
    * info tabs are showing
    */ 
    var featureOnScreen = function(feature, bounds) {
        try {
            if (bounds && feature.geometry) {
                return feature.geometry.intersects(bounds.toGeometry());
            } else {
                return feature.onScreen();
            }
        } catch (exception) {
            return false;
        }
    }

    // Connect the featuresSelected callback above to the featureselected
    // events in the point and rectangle control.
    getControl.events.register('featuresselected', 
        getControl,
        featuresSelected);
    boxControl.events.register('featuresselected', 
        boxControl, 
        featuresSelected);
    idControl.events.register('featuresselected', 
        idControl, 
        idFeature);

    // A callback for deselecting features from different controls.
    var featureUnselected = function(e){
        selection.removeFeatures([e.feature]);
    };

    // Connect the featureUnselected callback above to the featureunselected
    // events in the point and rectangle control.
    getControl.events.register('featureunselected', 
        this, 
        featureUnselected);
    boxControl.events.register('featureunselected', 
        this, 
        featureUnselected);

    // Connect a method for indicating work when the district layer
    // is reloaded.
    districtLayer.events.register('loadstart',districtLayer,function(){
        OpenLayers.Element.addClass(olmap.viewPortDiv, 'olCursorWait');
    });


    // This object holds the mean and standard deviation for the 
    // compactness scores, calculated when the features are loaded.
    var compactnessAvg = {};


    var getCompactnessAvg = function(features) {
        var average = function(a){
            //+ Carlos R. L. Rodrigues
            //@ http://jsfromhell.com/array/average [rev. #1]
            var r = {mean: 0, variance: 0, deviation: 0}, t = a.length;
            for(var m, s = 0, l = t; l--; s += a[l]);
            for(m = r.mean = s / t, l = t, s = 0; l--; s += Math.pow(a[l] - m, 2));
            return r.deviation = Math.sqrt(r.variance = s / t), r;
        };

        var scores = [];
        for (var i = 0; i < features.length; i++) {
            var feature = features[i];
            scores.push(feature.attributes.compactness);
        }
        return average(scores);

    };

    // Get the OpenLayers styling rules for the map, given the district 
    // layer and/or modification (e.g. No styling compactness) taken from
    // the District By: dropdown.
    var getStylingRules = function(typeName, dby) {
        var rules = [];
        var lowestColor = $('.farunder').css('background-color');
        var lowerColor = $('.under').css('background-color');
        var upperColor = $('.over').css('background-color');
        var highestColor = $('.farover').css('background-color');
        var lockedColor = $('.locked').css('border-top-color');
        
        if (typeName == 'demographics') {
            rules = [
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.LESS_THAN_OR_EQUAL_TO,
                        property: 'number',
                        value: RULES[dby.by].lowest
                    }),
                    symbolizer: {
                        fillColor: lowestColor,
                        fillOpacity: 0.5
                    }
                }),
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.BETWEEN,
                        property: 'number',
                        lowerBoundary: RULES[dby.by].lowest,
                        upperBoundary: RULES[dby.by].lower
                    }),
                    symbolizer: {
                        fillColor: lowerColor,
                        fillOpacity: 0.5
                    }
                }),
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.BETWEEN,
                        property: 'number',
                        lowerBoundary: RULES[dby.by].lower,
                        upperBoundary: RULES[dby.by].upper
                    })
                }),
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.BETWEEN,
                        property: 'number',
                        lowerBoundary: RULES[dby.by].upper,
                        upperBoundary: RULES[dby.by].highest
                    }),
                    symbolizer: {
                        fillColor: upperColor,
                        fillOpacity: 0.5
                    }
                }),
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.GREATER_THAN_OR_EQUAL_TO,
                        property: 'number',
                        value: RULES[dby.by].highest
                    }),
                    symbolizer: {
                        fillColor: highestColor,
                        fillOpacity: 0.5
                    }
                })
            ];
        } else if (typeName == 'Contiguity') {
            rules = [
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: 'contiguous',
                        value: false
                    }),
                    symbolizer: {
                        fillColor: highestColor,
                        fillOpacity: 0.5
                    }
                }),
                new OpenLayers.Rule({
                    filter: new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.NOT_EQUAL_TO,
                        property: 'contiguous',
                        value: false
                    })
                })
        
            ];
        } else if (typeName == 'Compactness') {
            if (compactnessAvg) {
                var upper = compactnessAvg.mean + (2 * compactnessAvg.deviation);
                var lower = compactnessAvg.mean - (2 * compactnessAvg.deviation); 
                rules = [
                    new OpenLayers.Rule({
                        filter: new OpenLayers.Filter.Comparison({
                            type: OpenLayers.Filter.Comparison.LESS_THAN,
                            property: 'compactness',
                            value: lower 
                        }),
                        symbolizer: {
                            fillColor: lowestColor,
                            fillOpacity: 0.5
                        }
                    }),
                    new OpenLayers.Rule({
                        filter: new OpenLayers.Filter.Comparison({
                            type: OpenLayers.Filter.Comparison.BETWEEN,
                            property: 'compactness',
                            lowerBoundary: lower,
                            upperBoundary: upper
                        })
                    }),
                    new OpenLayers.Rule({
                        filter: new OpenLayers.Filter.Comparison({
                            type: OpenLayers.Filter.Comparison.GREATER_THAN,
                            property: 'compactness',
                            value: upper 
                        }),
                        symbolizer: {
                            fillColor: highestColor,
                            fillOpacity: 0.5
                        }
                    })
                ];
            }

        }

        rules.push(new OpenLayers.Rule({
            filter: new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.EQUAL_TO,
                property: 'is_locked',
                value: true
            }),
            symbolizer: {
                strokeColor: lockedColor,
                strokeWidth: 4
            }
        }));
        rules.push(new OpenLayers.Rule({
            filter: new OpenLayers.Filter.Comparison({
                type: OpenLayers.Filter.Comparison.NOT_EQUAL_TO,
                property: 'is_locked',
                value: true
            })
        }));
        
        return rules;
    };
    // Recompute the rules for the district styling prior to the adding
    // of the features to the district layer.  This is done at this time
    // to prevent 2 renderings from being triggered on the district layer.
    districtLayer.events.register('beforefeaturesadded',districtLayer,function(context){
        var newOptions = OpenLayers.Util.extend({}, districtStyle);
        var dby = getDistrictBy();
        var rules = []
        if (!dby.modified) {
            rules = getStylingRules('demographics', dby);
        } else {
            rules = getStylingRules(dby.modified, dby);
        }
        
        var newStyle = new OpenLayers.Style(newOptions,{
            rules:rules
        });
        districtLayer.styleMap = new OpenLayers.StyleMap(newStyle);
    });

    var updatingAssigned = false;
    var updateAssignableDistricts = function() {
        if (updatingAssigned)
            return;
        updatingAssigned = true;

        var version = $('#history_cursor').val();
        $.ajax({
            type:'GET',
            url:'../districts/',
            data: {version:version},
            success: function(data,txtStatus,xhr){
                updatingAssigned = false;
                // do nothing if this call did not succeed
                if (!data.success) {
                    if ('redirect' in data) {
                        window.location.href = data.redirect;
                    }
                    return;
                }

                var currentDist = $('#assign_district').val();

                $('#assign_district option').detach();
                $('#assign_district')
                    .append('<option value="-1">-- Select One --</option>')
                    .append('<option value="1">Unassigned</option>');

                // get the maximum version of all districts. If walking 
                // backward, it may be possible that the version you 
                // requested (let's say you requested version 3 of a plan)
                // doesn't have any districts. This will happen if a user 
                // performs many undo steps, then edits the plan. In this
                // case, the maximum version will be LESS than the version
                // requested.
                var max_version = 0;
                for (var d in data.districts) {
                    var district = data.districts[d];
                    max_version = Math.max(district.version,max_version);

                    if (district.name != 'Unassigned') {
                        $('#assign_district')
                            .append('<option value="' + district.id + '">' + district.name + '</option>');
                    }
                }

                if ($('#assign_district option').length < MAX_DISTRICTS + 1) {

                    $('#assign_district')
                        .append('<option value="new">New ' + BODY_MEMBER + '</option>');
                }

                var all_options = $('#assign_district option').detach();
                // sort the options
                all_options.sort(function(a,b){
                    if (a.value == 'new') {
                        return 1;
                    } else if (b.value == 'new') {
                        return -1;
                    } else {
                        return parseInt(a.value,10) > parseInt(b.value,10);
                    }
                });
                all_options.appendTo('#assign_district');

                // ensures that '-- Select One --' is selected
                $('#assign_district').val(-1);
                
                if (assignMode == 'anchor') {
                    // ONLY IF the district exists, and is in the option 
                    // list will this change the current selection in the
                    // dropdown
                    $('#assign_district').val(currentDist);

                    if ($('#assign_district').val() != currentDist) {
                        $('#anchor_tool').removeClass('toggle');
                        assignMode = null;
                    }
                }

                // set the version cursor to the max version. In situations
                // where there has been an edit on an undo, the version 
                // cursor in not continuous across all versions of the 
                // plan.
                var cursor = $('#history_cursor');
                if (version != max_version) {
                    // Purge all versions that are in the history that are
                    // missing. You can get here after editing a plan for 
                    // a while, then performing some undos, then editing 
                    // again. You will be bumped up to the latest version 
                    // of the plan, but there will be 'phantom' versions 
                    // between the undo version basis and the current 
                    // plan version.
                    while (version > max_version && version >= 0) {
                        delete PLAN_HISTORY[version--];
                    }
                }

                PLAN_HISTORY[max_version] = true;
                cursor.val(max_version);

                if (max_version == 0) {
                    $('#history_undo').addClass('disabled');
                }
            }
        });
    };

    // Connect an event to the district layer that updates the 
    // list of possible districts to assign to.
    // TODO: this doesn't account for districts with null geometries
    // which will not come back from the WFS query
    var updateLevel = getSnapLayer().geolevel;
    var updateDistrictScores = function(){
        var geolevel = getSnapLayer().geolevel;
        if (selection.features.length > 0 && 
            (geolevel != updateLevel || selection.features[0].renderIntent == 'select')) {
            updateLevel = geolevel;
            selection.removeFeatures(selection.features);

            // since we are removing features, terminate any controls that
            // may be in limbo (dragdropControl, I'm looking at you)
            if (assignMode == 'dragdrop') {
                dragdropControl.deactivate();
                dragdropControl.resumeTool.activate();
            }
        }
        
        var sorted = districtLayer.features.slice(0,districtLayer.features.length);
        sorted.sort(function(a,b){
            return a.attributes.name > b.attributes.name;
        });
        compactnessAvg = getCompactnessAvg(sorted);

        var working = $('#working');
        if (working.dialog('isOpen')) {
            working.dialog('close');
        }

        OpenLayers.Element.removeClass(olmap.viewPortDiv, 'olCursorWait');
    };

    // When the navigate map tool is clicked, disable all the 
    // controls except the navigation control.
    $('#navigate_map_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        navigate.activate();
        $('#dragdrop_tool').removeClass('toggle');
        $('#anchor_tool').removeClass('toggle');
        assignMode = null;
        $('#assign_district').val(-1);
        tipdiv.style.display = 'none';
        districtIdDiv.style.display = 'none';
    });

    // When the identify map tool is clicked, disable all the
    // controls except the identify control.
    $('#identify_map_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        idControl.activate();
        $('#dragdrop_tool').removeClass('toggle');
        $('#anchor_tool').removeClass('toggle');
        assignMode = null;
        $('#assign_district').val(-1);
    });

    // When the district id map tool is clicked, disable all the
    // controls except the district id control.
    $('#district_id_map_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        districtIdControl.activate();
        $('#dragdrop_tool').removeClass('toggle');
        $('#anchor_tool').removeClass('toggle');
        assignMode = null;
        $('#assign_district').val(-1);
    });

    // When the lock district map tool is clicked, disable all the
    // controls except the lock district control.
    $('#lock_district_map_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        lockDistrictControl.activate();
        $('#dragdrop_tool').removeClass('toggle');
        $('#anchor_tool').removeClass('toggle');
        assignMode = null;
        $('#assign_district').val(-1);
    });
    
    // When the single pick tool is clicked, disable all the
    // controls except for the single pick tool.
    $('#single_drawing_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        getControl.activate();
        getControl.features = selection.features;
        tipdiv.style.display = 'none';
        districtIdDiv.style.display = 'none';
    });

    // When the rectangle selection tool is clicked, disable all the
    // controls except for the rectangle selection tool.
    $('#rectangle_drawing_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        boxControl.activate();
        boxControl.features = selection.features;
        tipdiv.style.display = 'none';
        districtIdDiv.style.display = 'none';
    });

    // When the polygon selection tool is clicked, disable all the
    // controls except for the polygon selection tool.
    $('#polygon_drawing_tool').click(function(evt){
        var active = olmap.getControlsBy('active',true);
        for (var i = 0; i < active.length; i++) {
            if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                active[i].deactivate();
            }
        }
        polyControl.activate();
        tipdiv.style.display = 'none';
        districtIdDiv.style.display = 'none';
    });

    // When the assignment tool is clicked, disable all the
    // controls except for the assignment tool.  
    $('#dragdrop_tool').click(function(evt){
        var me = $(this);
        var selectionAlready = false;
        if (me.hasClass('toggle')) {
            me.removeClass('toggle');
            assignMode = null;
            dragdropControl.deactivate();
            if (dragdropControl.resumeTool) {
                dragdropControl.resumeTool.activate();
            }
        }
        else {
            me.addClass('toggle');
            assignMode = 'dragdrop';
            if (selection.features.length > 0) {
                var active = olmap.getControlsBy('active',true);
                dragdropControl.resumeTool = null;
                for (var i = 0; i < active.length && dragdropControl.resumeTool == null; i++) {
                    if (active[i].CLASS_NAME != 'OpenLayers.Control.KeyboardDefaults') {
                        dragdropControl.resumeTool = active[i];
                        active[i].deactivate();
                    }
                }
                dragdropControl.activate();
                selectionAlready = true;
            }
        }
        $('#navigate_map_tool').removeClass('toggle');
        navigate.deactivate();
        $('#identify_map_tool').removeClass('toggle');
        idControl.deactivate();
        $('#district_id_map_tool').removeClass('toggle');
        districtIdControl.deactivate();
        $('#lock_district_map_tool').removeClass('toggle');
        lockDistrictControl.deactivate();
        $('#anchor_tool').removeClass('toggle');
        tipdiv.style.display = 'none';
        districtIdDiv.style.display = 'none';

        // enable single select tool if no selection tool is enabled
        if (!(getControl.active || boxControl.active || polyControl.active) && !selectionAlready) {
            getControl.activate();
            $('#single_drawing_tool').addClass('toggle');
        }
    });

    $('#anchor_tool').click(function(evt){
        var me = $(this);
        if (me.hasClass('toggle')) {
            me.removeClass('toggle');
            assignMode = null;
            $('#assign_district').val(-1);
        }
        else {
            me.addClass('toggle');
            assignMode = 'anchor';

            var anchorTip = $('#anchor_tool').data('tooltip');
            anchorTip.hide();
            var assignTip = $('#assign_district').data('tooltip');
            assignTip.show();
            // must show before grabbing text
            var origText = assignTip.getTip().text();
            assignTip.getTip().text('Select the destination district');
            setTimeout(function(){
                assignTip.getTip().hide();
                assignTip.getTip().text(origText);
            }, 5000);
        }
        $('#navigate_map_tool').removeClass('toggle');
        navigate.deactivate();
        $('#identify_map_tool').removeClass('toggle');
        idControl.deactivate();
        $('#district_id_map_tool').removeClass('toggle');
        districtIdControl.deactivate();
        $('#lock_district_map_tool').removeClass('toggle');
        lockDistrictControl.deactivate();
        $('#dragdrop_tool').removeClass('toggle');
        tipdiv.style.display = 'none';
        districtIdDiv.style.display = 'none';

        // enable single select tool if no selection tool is enabled
        if (!(getControl.active || boxControl.active || polyControl.active)) {
            getControl.activate();
            $('#single_drawing_tool').addClass('toggle');
        }
    });

    // Add the created controls to the map
    olmap.addControls([
        getControl,
        boxControl,
        polyControl,
        new GlobalZoom(),
        idControl,
        districtIdControl,
        lockDistrictControl,
        dragdropControl
    ]);

    // get a format parser for SLDs and the legend
    var sldFormat = new OpenLayers.Format.SLD();

    // a method that will read the named layer, and return
    // the default style
    var getDefaultStyle = function(sld, layerName) {
        var styles = sld.namedLayers[layerName].userStyles;
        var style = { isDefault:false };
        for(var i=0; i<styles.length && !style.isDefault; ++i) {
            style = styles[i];
        }
        return style;
    }

    //
    // get the styles associated with the current map configuration
    //
    var getMapStyles = (function() {
        var styleCache = {};
        var callbackStyle = function(sld) {
            var userStyle = getDefaultStyle(sld,getShowBy());
            $('#legend_title').empty().append(userStyle.title);

            var lbody = $('#basemap_legend tbody');
            lbody.empty();

            var rules = userStyle.rules;
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                if (!('Polygon' in rule.symbolizer)) {
                    continue;
                }

                var div = $('<div/>');
                div.css('background-color',rule.symbolizer.Polygon.fillColor);
                div.css('border-width',rule.symbolizer.Polygon.strokeWidth);
                div.css('border-color',rule.symbolizer.Polygon.strokeColor);
                div.addClass('swatch');
                div.addClass('basemap_swatch');
                var swatch = $('<td/>');
                swatch.width(32);
                swatch.append(div);

                var row = $('<tr/>');
                row.append(swatch);

                var title = $('<td/>');
                title.append( rule.title );

                row.append(title);

                lbody.append(row);
            }
        };

        return function() {
            var snap = getSnapLayer().layer.split('simple_')[1];
            var show = getShowBy();

            styleUrl = '/sld/' + snap + '_' + show + '.sld';

            if (styleUrl in styleCache) {
                if (styleCache[styleUrl]) {
                    callbackStyle(styleCache[styleUrl]);
                    return;
                }
            } else {
                styleCache[styleUrl] = false;
            }

            OpenLayers.Request.GET({
                url: styleUrl,
                method: 'GET',
                callback: function(xhr){
                    var sld = sldFormat.read(xhr.responseXML || xhr.responseText);
                    styleCache[styleUrl] = sld;
                    callbackStyle(sld);
                }
            });
        };
    })();

    //
    // Update the part of the legend associated with the 
    // Show Boundaries: control
    //
    var updateBoundaryLegend = function() {
        var boundary = getBoundLayer();
        if (boundary == '') {
            $('#boundary_legend').hide();
             return;
        }

        OpenLayers.Request.GET({
            url: '/sld/' + boundary.substr(4) + '.sld',
            method: 'GET',
            callback: function(xhr){
                var sld = sldFormat.read(xhr.responseXML || xhr.responseText);
                var userStyle = getDefaultStyle(sld,'Boundaries');
                $('#boundary_title').empty().append(userStyle.title);

                var lbody = $('#boundary_legend tbody');
                lbody.empty();

                var rules = userStyle.rules;
                for (var i = 0; i < rules.length; i++) {
                    var rule = rules[i];
                    if (!('Polygon' in rule.symbolizer)) {
                        continue;
                    }

                    var div = $('<div/>');
                    div.css('border-color',rule.symbolizer.Polygon.strokeColor);
                    div.addClass('swatch');
                    div.addClass('boundary_swatch');
                    var swatch = $('<td/>');
                    swatch.width(32);
                    swatch.append(div);

                    var row = $('<tr/>');
                    row.append(swatch);

                    var title = $('<td/>');
                    title.append( rule.title );

                    row.append(title);

                    lbody.append(row);
                    $('#boundary_legend').show();
                }
            }
        });
    };

    //
    // Update the styles of the districts based on the 'Show District By'
    // dropdown in the menu.
    //
    var makeDistrictLegendRow = function(id, cls, label) {
        var div = $('<div id="' + id + '">&nbsp;</div>');
        div.addClass('swatch');
        div.addClass('district_swatch');
        div.addClass(cls)
        var swatch = $('<td/>');
        swatch.width(32);
        swatch.append(div);

        var row = $('<tr/>');
        row.append(swatch);

        var title = $('<td/>');
        title.append( label );

        row.append(title);

        return row;
    };
    
    var updateDistrictStyles = function() {
        var distDisplay = getDistrictBy();
        var lbody = $('#district_legend tbody');

        if (distDisplay.modified == 'None') {
            lbody.empty();

            var row = makeDistrictLegendRow('district_swatch_within','target','Boundary');

            lbody.append(row);
        }
        else if (distDisplay.modified == 'Contiguity') {
            lbody.empty();
            var row = makeDistrictLegendRow('district_swatch_farover','farover','Noncontiguous');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_within','target','Contiguous');
            lbody.append(row);
        }
        else if (distDisplay.modified == 'Compactness') {
            lbody.empty();

            var row = makeDistrictLegendRow('district_swatch_farover','farover','Very Compact');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_within','target','Average');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_farunder','farunder','Hardly Compact');
            lbody.append(row);
        }
        else {
            lbody.empty();

            var row = makeDistrictLegendRow('district_swatch_farover','farover','Far Over Target');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_over','over','Over Target');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_within','target','Within Target');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_under','under','Under Target');
            lbody.append(row);
            row = makeDistrictLegendRow('district_swatch_farunder','farunder','Far Under Target');
            lbody.append(row);
        }

        // Add legend row for locked districts.
        row = makeDistrictLegendRow('district_swatch_within','locked','Locked For Editing');
        lbody.append(row);
    };

    // Logic for the 'Snap Map to' dropdown, note that this logic
    // calls the boundsforChange callback
    var changingSnap = false;
    var changeSnapLayer = function(evt) {
        if (changingSnap)
            return;
        changingSnap = true;

        var newOpts = getControl.protocol.options;
        var show = getShowBy();
        var snap = getSnapLayer();
        var layername = NAMESPACE + ':demo_' + snap.level;
        if (show != 'none') {
            layername += '_' + show;
        }
        var layers = olmap.getLayersByName(layername);

        newOpts.featureType = snap.layer;
        getControl.protocol = 
            boxControl.protocol = new OpenLayers.Protocol.HTTP( newOpts );
        setThematicLayer(layers[0]);
        doMapStyling();
        $('#showby').siblings('label').text('Show ' + snap.display + ' by:');
        getMapStyles();
        updateBoundaryLegend();

        if (olmap.center !== null) {
            districtLayer.filter = getVersionAndSubjectFilters(olmap.getExtent());
            districtLayer.strategies[0].update({force:true});
        }

        changingSnap = false;
    };

    // Logic for the 'Show Map by' dropdown
    $('#showby').change(function(evt){
        var snap = getSnapLayer();
        var show = evt.target.value;
        var layername = NAMESPACE + ':demo_' + snap.level;
        if (show != 'none') {
            layername += '_' + show;
        }

        var layers = olmap.getLayersByName(layername);
        setThematicLayer(layers[0]);
        doMapStyling();
        getMapStyles();
        updateBoundaryLegend();

        // Since keyboard defaults are on, if focus remains on this
        // dropdown after change, the keyboard may change the selection
        // inadvertently
        $('#showby').blur();
    });

    // Logic for the 'Show Districts by' dropdown
    $('#districtby').change(function(evt){
        districtLayer.filter = getVersionAndSubjectFilters(maxExtent);
        districtLayer.strategies[0].update({force:true});

        // Since keyboard defaults are on, if focus remains on this
        // dropdown after change, the keyboard may change the selection
        // inadvertently
        $('#districtby').blur();
    });

    boundaryLayer = {};
    $('#boundfor').change(function(evt){
        try {
            boundaryLayer.setVisibility(false);
        } catch (err) {
            // That's ok - just initializing.
        }
        var name = getBoundLayer();
        if (name != '') {
            var layer = olmap.getLayersByName(name)[0];
            boundaryLayer = layer;
            layer.setVisibility(true);
        }
        doMapStyling();
        getMapStyles();
        updateBoundaryLegend();

        // Since keyboard defaults are on, if focus remains on this
        // dropdown after change, the keyboard may change the selection
        // inadvertently
        $('#boundfor').blur();
    });

    // Logic for the 'Assign District to' dropdown
    $('#assign_district').change(function(evt){
        if (this.value == '-1'){
            return true;
        }
        else if (this.value == 'new'){
            createNewDistrict();
        }
        else if (assignMode == null) {
            var feature = { data:{ district_id: this.value } };
            assignOnSelect(feature);
        }

        // Since keyboard defaults are on, if focus remains on this
        // dropdown after change, the keyboard may change the selection
        // inadvertently
        $('#assign_district').blur();
    });

    // Logic for the history back button
    $('#history_undo').click(function(evt){
        var cursor = $('#history_cursor');
        var ver = cursor.val();
        if (ver > 0) {
            ver--;
            PLAN_HISTORY[ver] = true;

            if (ver == 0) {
                $(this).addClass('disabled');
            }
            cursor.val(ver);

            $('#history_redo').removeClass('disabled');

            updateInfoDisplay();
            updateAssignableDistricts();
        }
    });

    // Logic for history redo button
    $('#history_redo').click(function(evt){
        var cursor = $('#history_cursor');
        var ver = cursor.val();
        if (ver < PLAN_VERSION) {
            ver++;
            while (!(ver in PLAN_HISTORY) && ver <= PLAN_VERSION) {
                ver++;
            }
            if (ver == PLAN_VERSION) {
                $(this).addClass('disabled');
            }
            cursor.val(ver);

            $('#history_undo').removeClass('disabled');

            updateInfoDisplay();
            updateAssignableDistricts();
        }
    });

    /*
    * Ask the user for a new district name, then assign the current 
    * selection to the new district upon successful creation of the
    * district
    */
    var createNewDistrict = function() {
        if (selection.features.length == 0) {
            $('#assign_district').val('-1');
            return;
        }

        // Once we have the district name, post a request to the 
        // server to create it in the DB
        var createDistrict = function(district_id) {
            var geolevel_id = selection.features[0].attributes.geolevel_id;
            var geounit_ids = [];
            for (var i = 0; i < selection.features.length; i++) {
                geounit_ids.push( selection.features[i].attributes.id );
            }
            geounit_ids = geounit_ids.join('|');
            OpenLayers.Element.addClass(olmap.viewPortDiv,'olCursorWait');
            $('#working').dialog('open');
            $.ajax({
                type: 'POST',
                url: '/districtmapping/plan/' + PLAN_ID + '/district/new/',
                data: {
                    district_id: district_id,
                    geolevel: geolevel_id,
                    geounits: geounit_ids,
                    version: getPlanVersion()
                },
                success: function(data, textStatus, xhr) {
                    var mode = data.success ? 'select' : 'error';
                    for (var i = 0; i < selection.features.length; i++) { 
                        selection.drawFeature(selection.features[i], mode);
                    } 

                    if (!data.success && 'redirect' in data) {
                        window.location.href = data.redirect;
                        return;
                    }

                    // update the max version of this plan
                    PLAN_VERSION = data.version;
                    PLAN_HISTORY[PLAN_VERSION] = true;

                    $('#history_cursor').val(data.version);

                    // update the UI buttons to show that you can
                    // perform an undo now, but not a redo
                    $('#history_redo').addClass('disabled');
                    $('#history_undo').removeClass('disabled');

                    updateInfoDisplay();
                    updateAssignableDistricts();

                    $('#working').dialog('close');
                    $('#assign_district').val('-1');
                    OpenLayers.Element.removeClass(olmap.viewPortDiv,'olCursorWait'); 
                }
            });
        };

        // create a list of available districts, based on the districts
        // that are already in the plan
        var options = $('#assign_district')[0].options;
        var avail = []
        for (var d = 1; d < MAX_DISTRICTS; d++) {
            var dtaken = false;
            for (var o = 0; o < options.length && !dtaken; o++) {
                dtaken = dtaken || ( options[o].text == BODY_MEMBER + d)
            }
            if (!dtaken) {
                avail.push('<option value="'+(d+1)+'">'+BODY_MEMBER+d+'</option>');
            }
        }

        // Create a dialog to get the new district's name from the user.
        // On close, destroy the dialog.
        $('<div id="newdistrictdialog">Please select a district name:<br/><select id="newdistrictname">' + avail.join('') + '</select></div>').dialog({
            modal: true,
            autoOpen: true,
            title: 'New District',
            buttons: { 
                'OK': function() { 
                    createDistrict($('#newdistrictname').val()); 
                    $(this).dialog("close"); 
                    $('#newdistrictdialog').remove(); 
                },
                'Cancel': function() { 
                    $(this).dialog("close"); 
                    $('#newdistrictdialog').remove(); 
                    $('#assign_district').val('-1');
                }
            }
         });
    };

    /*
    * After the map has finished moving, this method updates the jQuery
    * data attributes of the geography and demographics tables if 
    * different districts are now visible
    */
    olmap.prevVisibleDistricts = '';
    var sortByVisibility = function(force) {
        var visibleDistricts = '';
        var visible, notvisible = '';
        $('#geography_table tr').data('isVisibleOnMap', false);
        $('#demographic_table tr').data('isVisibleOnMap', false);

        for (feature in districtLayer.features) {
            var feature = districtLayer.features[feature];
            var inforow = $('.inforow_' + feature.attributes.district_id);
            if (featureOnScreen(feature, getVisibleBounds())) {
                inforow.data('isVisibleOnMap', true);
                visibleDistricts += feature.id;
            }
        }
        if (visibleDistricts != olmap.prevVisibleDistricts || force) {
            var demosorter = viewablesorter({ target: '#demographic_table tbody' }).init();
            var geosorter = viewablesorter({ target: '#geography_table tbody' }).init();
            demosorter.sortTable();
            geosorter.sortTable();
            olmap.prevVisibleDistricts = visibleDistricts;
        }

        updateDistrictStyles();
    };
   
    // triggering this event here will configure the map to correspond
    // with the initial dropdown values (jquery will set them to different
    // values than the default on a reload). A desirable side effect is
    // that the map styling and legend info will get loaded, too, so there
    // is no need to explicitly perform doMapStyling() or getMapStyles()
    // in this init method.
    changeSnapLayer();

    // Set the initial map extents to the bounds around the study area.
    olmap.zoomToExtent(STUDY_BOUNDS);
    OpenLayers.Element.addClass(olmap.viewPortDiv, 'olCursorWait');

    // set up sizing for dynamic map size that fills the pg
    initializeResizeFix();

    districtLayer.events.register('loadend', districtLayer, sortByVisibility);
    districtLayer.events.register('loadend', districtLayer, updateDistrictScores);

    olmap.events.register('movestart',olmap,function(){
        districtIdDiv.style.display = 'none';
        tipdiv.style.display = 'none';
    });
    olmap.events.register('moveend', olmap, sortByVisibility);
    
    // Add the listeners for editing whenever a base layer is changed
    // or the zoom level is changed
    olmap.events.register('changebaselayer', olmap, changeSnapLayer);
    olmap.events.register('zoomend', olmap, changeSnapLayer);

    PLAN_HISTORY[PLAN_VERSION] = true;
}

IdGeounit = OpenLayers.Class(OpenLayers.Control.GetFeature, {
    /*
     * Initialize this control, enabling multiple selects with a single
     * click.
     */
    initialize: function(options) {
        options = options || {};
        OpenLayers.Util.extend(options, {
            multiple: true,
            clickTolerance: 0.5,
            maxFeatures: 25,
            filterType: OpenLayers.Filter.Spatial.INTERSECTS
        });

        // concatenate events specific to vector with those from the base
        this.EVENT_TYPES =
            OpenLayers.Control.GetFeature.prototype.EVENT_TYPES.concat(
            OpenLayers.Control.prototype.EVENT_TYPES
        );

        options.handlerOptions = options.handlerOptions || {};

        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        
        this.features = {};

        this.handlers = {};
        
        this.handlers.click = new OpenLayers.Handler.Click(this,
            {click: this.selectClick}, this.handlerOptions.click || {});
    },

    selectClick: function(evt) {
        // Set the cursor to "wait" to tell the user we're working on their click.
        OpenLayers.Element.addClass(this.map.viewPortDiv, "olCursorWait");
                        
        var bounds = this.pixelToBounds(evt.xy);
                                        
        this.setModifiers(evt);
        this.request(bounds, {single: false});
    },

    CLASS_NAME: 'IdGeounit'
});

GlobalZoom = OpenLayers.Class(OpenLayers.Control, { 
  // DOM Elements
    
    /** 
     * Property: controlDiv
     * {DOMElement}
     */
    controlDiv: null,

    /*
     * Constructor: GlobalZoom
     * 
     * Parameters:
     * options - {Object}
     */
    initialize: function(options) {
        OpenLayers.Control.prototype.initialize.apply(this, arguments);
    },

    /**
     * APIMethod: destroy 
     */    
    destroy: function() {
        OpenLayers.Event.stopObservingElement(this.controlDiv);
        OpenLayers.Control.prototype.destroy.apply(this, arguments);
    },

    /** 
     * Method: setMap
     *
     * Properties:
     * map - {<OpenLayers.Map>} 
     */
    setMap: function(map) {
        OpenLayers.Control.prototype.setMap.apply(this, arguments);
    },

    /**
     * Method: onZoomToExtent
     *
     * Parameters:
     * e - {Event}
     */
    onZoomToExtent: function(e) {
        // This has been changed to use the map's maxExtent rather than just performing a
        // zoomToMaxExtent, because maxExtent is broken on the OSM layer
        this.map.zoomToExtent(STUDY_BOUNDS);
        OpenLayers.Event.stop(e);
    },

    /**
     * Method: draw
     *
     * Returns:
     * {DOMElement} A reference to the DIV DOMElement containing the 
     *     switcher tabs.
     */  
    draw: function() {
        OpenLayers.Control.prototype.draw.apply(this);

        this.loadContents();

        // populate div with current info
        this.redraw();    

        return this.div;
    },
    
    /** 
     * Method: redraw
     * Goes through and takes the current state of the Map and rebuilds the
     *     control to display that state. Groups base layers into a 
     *     radio-button group and lists each data layer with a checkbox.
     *
     * Returns: 
     * {DOMElement} A reference to the DIV DOMElement containing the control
     */  
    redraw: function() {
        return this.div;
    },

    /** 
     * Method: loadContents
     * Set up the labels and divs for the control
     */
    loadContents: function() {

        //configure main div

        OpenLayers.Event.observe(this.div, "click", 
            OpenLayers.Function.bindAsEventListener(
                this.onZoomToExtent, this) );

        // layers list div        
        this.controlDiv = document.createElement("div");
        this.controlDiv.id = this.id + "_controlDiv";
        OpenLayers.Element.addClass(this.controlDiv, "controlDiv");

        this.div.appendChild(this.controlDiv);
    },
    
    CLASS_NAME: "GlobalZoom"
});

// Modify the spherical mercator initialization function so projection
// is not hardcoded, but instead set in the layer options. This is needed,
// because otherwise 900913 is always used, when we want 3785. This causes
// a slight difference which results in the map being offset.
OpenLayers.Layer.SphericalMercator.initMercatorParameters = function() {
    this.RESOLUTIONS = [];
    var maxResolution = 156543.0339;
    for(var zoom = 0; zoom <= this.MAX_ZOOM_LEVEL; ++zoom) {
        this.RESOLUTIONS[zoom] = maxResolution / Math.pow(2, zoom);
    }
};

// Modify the OSM layer to add support for minZoomLevel
OpenLayers.Layer.XYZ = OpenLayers.Class(OpenLayers.Layer.XYZ, {     
    initialize: function(name, url, options) {
        var minZoom = 0;
        if (options.minZoomLevel) {
            minZoom = options.minZoomLevel;
        }
        if (options && options.sphericalMercator || this.sphericalMercator) {
            options = OpenLayers.Util.extend({
                maxExtent: new OpenLayers.Bounds(
                    -128 * 156543.0339,
                    -128 * 156543.0339,
                    128 * 156543.0339,
                    128 * 156543.0339
                ),
                maxResolution: 156543.0339 / Math.pow(2, minZoom),
                numZoomLevels: 19,
                units: "m",
                projection: "EPSG:3785"
            }, options);
        }
        url = url || this.url;
        name = name || this.name;
        var newArguments = [name, url, {}, options];
        OpenLayers.Layer.Grid.prototype.initialize.apply(this, newArguments);
    },
    getURL: function (bounds) {
        var res = this.map.getResolution();
        var x = Math.round((bounds.left - this.maxExtent.left) / (res * this.tileSize.w));
        var y = Math.round((this.maxExtent.top - bounds.top) / (res * this.tileSize.h));
        var z = this.map.getZoom() + this.minZoomLevel;
        var url = this.url;
        var s = '' + x + y + z;
        if (url instanceof Array) {
            url = this.selectUrl(s, url);
        }
        var path = OpenLayers.String.format(url, {'x': x, 'y': y, 'z': z});
        return path;
    }
});
OpenLayers.Layer.OSM = OpenLayers.Class(OpenLayers.Layer.XYZ, {
    name: "OpenStreetMap",
    attribution: "Data CC-By-SA by <a href='http://openstreetmap.org/'>OpenStreetMap</a>",
    sphericalMercator: true,
    url: 'http://tile.openstreetmap.org/${z}/${x}/${y}.png',
    CLASS_NAME: "OpenLayers.Layer.OSM"
});