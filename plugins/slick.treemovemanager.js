(function($) {
    // register namespace
    $.extend(true, window, {
        "Slick": {
            "RowMoveManager": RowMoveManager
        }
    });

    function RowMoveManager(options) {
        var _grid;
        var _dataView;
        var _canvas;
        var _dragging;
        var _extend;
        var _id;
        var _parentId;
        var _indent;
        var _originItemId = null;
        var _self = this;
        var _handler = new Slick.EventHandler();
        var _defaults = {
            id: 'id',
            parentId: 'parentId',
            indent: 'indent',
            cancelEditOnDrag: false,
            prev: true,
            inner: true,
            next: true,
            beforeDrag: true,
            beforeDrop: true,
            onDrop: null
        };

        function init(grid) {
            options = $.extend(true, {}, _defaults, options);
            _grid = grid;
            _dataView = dataView;
            _id = options.id;
            _parentId = options.parentId;
            _indent = options.indent;
            _canvas = _grid.getCanvasNode();

            if (!_dataView) {
                throw 'this plugin must implement use dataView';
            }

            _handler
                .subscribe(_grid.onDragInit, handleDragInit)
                .subscribe(_grid.onDragStart, handleDragStart)
                .subscribe(_grid.onDrag, handleDrag)
                .subscribe(_grid.onDragEnd, handleDragEnd);
            _dataView.syncGridSelection(_grid, false);
        }

        function destroy() {
            _handler.unsubscribeAll();
        }

        function handleDragInit(e, dd) {
            // prevent the grid from cancelling drag'n'drop by default
            e.stopImmediatePropagation();
        }

        function apply(fun, param, defaultValue) {
            if ((typeof fun) == "function") {
                return fun.apply(this, param ? param : []);
            }
            return defaultValue;
        }

        function getAllChildrenItems(item, callback) {
            var idx = _dataView.getIdxById(item[_id]);
            var allItems = _dataView.getItems();
            var idToDrag = [item[_id]];
            for (; idx + 1 < allItems.length && $.inArray(allItems[idx + 1][_parentId], idToDrag) != -1; idx++) {
                idToDrag.push(allItems[idx + 1][_id]);
                if (callback) {
                    if (callback(allItems[idx + 1]) === false) {
                        break;
                    }
                }
            }
            return idToDrag;
        }

        function getItemsToDrag(item) {
            var itemsToDrag = [];
            itemsToDrag.push(item);

            getAllChildrenItems(item, function(childrenItem) {
                itemsToDrag.push(childrenItem);
            });
            return itemsToDrag;
        }

        function moveItem(targetItem, dragItem, moveType) {
            var dragItemList = getItemsToDrag(dragItem);
            var targetItemList = getItemsToDrag(targetItem);
            var dragParent = _dataView.getItemById(dragItem[_parentId]);

            _dataView.beginUpdate();
            var i;
            for (i = 0; i < dragItemList.length; i++) {
                _dataView.deleteItem(dragItemList[i][_id]);
            }

            var diff = targetItem[_indent] - dragItem[_indent];

            var idx = _dataView.getIdxById(targetItem[_id]);

            var positionToInsert;
            if (moveType === 'prev') {
                positionToInsert = idx;
                dragItem[_parentId] = targetItem[_parentId];
            } else if (moveType === 'inner') {
                positionToInsert = idx + targetItemList.length;
                diff = diff + 1;
                dragItem[_parentId] = targetItem[_id];
            } else if (moveType === 'next') {
                if (dragItem[_parentId] === targetItem[_id]) {
                    positionToInsert = idx + targetItemList.length - dragItemList.length;
                } else {
                    positionToInsert = idx + targetItemList.length;
                }
                dragItem[_parentId] = targetItem[_parentId];
            }

            _dataView.updateItem(targetItem[_id], targetItem);

            if (dragParent && dragParent[_id]) {
                _dataView.updateItem(dragParent[_id], dragParent);
            }

            for (i = 0; i < dragItemList.length; i++) {
                dragItemList[i][_indent] = dragItemList[i][_indent] + diff;
                _dataView.insertItem(positionToInsert + i, dragItemList[i]);
            }

            _dataView.endUpdate();
        }

        function handleDragStart(e, dd) {
            var cell = _grid.getCellFromEvent(e);

            if (options.cancelEditOnDrag && _grid.getEditorLock().isActive()) {
                _grid.getEditorLock().cancelCurrentEdit();
            }

            if (_grid.getEditorLock().isActive() || !/move|selectAndMove/.test(_grid.getColumns()[cell.cell].behavior)) {
                return false;
            }

            var item = _dataView.getItem(cell.row);
            var dragItemList = getItemsToDrag(item);

            if (apply(options.beforeDrag, [dragItemList], !!options.beforeDrag) === false) {
                return false;
            }

            dd.dragItem = item;
            dd.dragItemList = dragItemList;

            _dragging = true;
            e.stopImmediatePropagation();

            if (item) {
                if (!item._collapsed) {
                    _extend = true;
                    _originItemId = item[_id];
                }
                item._collapsed = true;
                _dataView.updateItem(item[_id], item);
            }


            // var selectedRows = _grid.getSelectedRows();

            // if (selectedRows.length == 0 || $.inArray(cell.row, selectedRows) == -1) {
            //     selectedRows = [cell.row];
            //     _grid.setSelectedRows(selectedRows);
            // }
            // dd.selectedRows = selectedRows;

            var rowHeight = _grid.getOptions().rowHeight;

            dd.selectionProxy = $("<div class='slick-reorder-proxy'/>")
                .css("position", "absolute")
                .css("zIndex", "99999")
                .css("width", $(_canvas).innerWidth())
                // .css("height", rowHeight * selectedRows.length)
                .css("height", rowHeight)
                .appendTo(_canvas);

            dd.guide = $("<div class='slick-reorder-guide'/>")
                .css("position", "absolute")
                .css("zIndex", "99998")
                .css("width", $(_canvas).innerWidth())
                .css("top", -1000)
                .appendTo(_canvas);
        }

        function handleDrag(e, dd) {
            if (!_dragging) {
                return;
            }

            e.stopImmediatePropagation();

            var top = e.pageY - $(_canvas).offset().top;
            dd.selectionProxy.css("top", top - 5);

            var rowHeight = _grid.getOptions().rowHeight;

            var targetRow = Math.max(0, Math.min(Math.floor(top / rowHeight), _grid.getDataLength()));

            var targetItem = _dataView.getItem(targetRow);

            var remainder = Math.max(0, Math.min(top % rowHeight, rowHeight));

            var moveType, rate = remainder / rowHeight;

            if (rate < 0.25) {
                moveType = 'prev';
            } else if (rate >= 0.25 && rate < 0.75) {
                moveType = 'inner';
            } else {
                moveType = 'next';
            }



            if (targetRow !== dd.targetRow || moveType !== dd.moveType) {
                var eventData = {
                    // "rows": dd.selectedRows
                };

                var canmove = true,
                    guideTop = -1000,
                    guideHeight = $('.slick-reorder-guide').height();

                if (dd.dragItem[_id] === targetItem[_id]) {
                    canmove = false;
                }

                if (canmove) {
                    if (moveType === 'prev' && apply(options.prev, [dd.dragItemList, targetItem], !!options.prev) !== false) {
                        guideTop = targetRow * rowHeight + 0.1 * rowHeight;
                    } else if (moveType === 'inner' && dd.dragItem[_parentId] !== targetItem[_id] && apply(options.inner, [dd.dragItemList, targetItem], !!options.inner) !== false) {
                        guideTop = targetRow * rowHeight + 0.5 * rowHeight;
                    } else if (moveType === 'next' && apply(options.next, [dd.dragItemList, targetItem], !!options.next) !== false) {
                        guideTop = targetRow * rowHeight + 0.9 * rowHeight - guideHeight;
                    } else {
                        canmove = false;
                    }
                }

                if (!canmove || apply(options.beforeDrop, [dd.dragItemList, targetItem, moveType], !!options.beforeDrop) === false) {
                    dd.guide.css("top", -1000);
                    dd.canMove = false;
                } else {
                    dd.guide.css("top", guideTop);
                    dd.canMove = true;
                }

                dd.targetRow = targetRow;
                dd.targetItem = targetItem;
                dd.moveType = moveType;
            }
        }

        function handleDragEnd(e, dd) {
            var cell = _grid.getCellFromEvent(e);
            if (!_dragging) {
                return;
            }
            _dragging = false;
            e.stopImmediatePropagation();

            dd.guide.remove();
            dd.selectionProxy.remove();
            if (dd.canMove) {
                var eventData = {
                    // "rows": dd.selectedRows,
                    "dragItemList": dd.dragItemList
                };

                moveItem(dd.targetItem, dd.dragItem, dd.moveType)
                apply(options.onDrop, [dd.dragItemList, dd.targetItem, dd.moveType])
            }
            if (_extend) {
                var originItem = _dataView.getItemById(_originItemId);
                originItem._collapsed = false;
                _dataView.updateItem(_originItemId, originItem);
                _extend = false;
            }
        }

        $.extend(this, {
            "init": init,
            "destroy": destroy,
            "getAllChildrenItems": getAllChildrenItems
        });
    }
})(jQuery);